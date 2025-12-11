import { supabase } from './supabase';
import { SerializedEditorState } from 'lexical';

/**
 * Upload a base64 image to Supabase Storage
 * @param base64Data - The base64 encoded image data
 * @param contentType - The MIME type of the image
 * @returns The public URL from Supabase Storage
 */
async function uploadBase64ToSupabase(base64Data: string, contentType: string): Promise<string> {
  try {
    // Convert base64 to buffer
    const base64WithoutPrefix = base64Data.split(',')[1] || base64Data;
    const buffer = Buffer.from(base64WithoutPrefix, 'base64');
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = contentType.split('/')[1] || 'jpg';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('post-images')
      .upload(fileName, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(data.path);
    
    return publicUrl;
  } catch (error) {
    console.error('Failed to upload image:', error);
    throw error;
  }
}

/**
 * Download an external image URL and upload to Supabase Storage
 * @param imageUrl - The external image URL to download
 * @returns The public URL from Supabase Storage
 */
async function downloadAndUploadToSupabase(imageUrl: string): Promise<string> {
  try {
    // Fetch the image from the external URL
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    // Get content type from response headers
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Convert response to buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = contentType.split('/')[1] || 'jpg';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('post-images')
      .upload(fileName, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(data.path);
    
    return publicUrl;
  } catch (error) {
    console.error('Failed to download and upload image:', error);
    throw error;
  }
}

/**
 * Recursively find all image nodes in the Lexical editor state
 */
function findImageNodes(node: any): string[] {
  const imageUrls: string[] = [];
  
  if (node.type === 'image' && node.src) {
    imageUrls.push(node.src);
  }
  
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      imageUrls.push(...findImageNodes(child));
    }
  }
  
  console.log('Found image URLs:', imageUrls);
  return imageUrls;
}

/**
 * Replace blob URLs with permanent URLs in the editor state
 */
function replaceImageUrls(node: any, urlMap: Map<string, string>): any {
  if (node.type === 'image' && node.src && urlMap.has(node.src)) {
    return {
      ...node,
      src: urlMap.get(node.src)
    };
  }
  
  if (node.children && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child: any) => replaceImageUrls(child, urlMap))
    };
  }
  
  return node;
}

/**
 * Process Lexical editor state: upload base64 images and download/re-upload external URLs
 * Note: All images (base64 and external URLs) will be uploaded to Supabase Storage
 * @param editorState - The Lexical SerializedEditorState
 * @returns Updated editor state with permanent image URLs from Supabase
 */
export async function processAndUploadImages(editorState: SerializedEditorState): Promise<SerializedEditorState> {
  try {
    // Find all image URLs in the editor state
    const imageUrls = findImageNodes(editorState.root);
    console.log('Image URLs to process:', imageUrls);
    
    if (imageUrls.length === 0) {
      console.log('No images found, skipping upload.');
      return editorState;
    }
    
    // Upload all images and create URL mapping
    const urlMap = new Map<string, string>();
    
    for (const imageUrl of imageUrls) {
      try {
        let permanentUrl: string;
        
        if (imageUrl.startsWith('data:image/')) {
          // Base64 image - extract content type and upload
          console.log('Uploading base64 image:', imageUrl.substring(0, 30) + '...');
          const contentTypeMatch = imageUrl.match(/data:(image\/[a-z]+);/);
          const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/jpeg';
          permanentUrl = await uploadBase64ToSupabase(imageUrl, contentType);
        } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          // External URL - download and re-upload
          console.log('Downloading and uploading external image:', imageUrl);
          permanentUrl = await downloadAndUploadToSupabase(imageUrl);
        } else {
          // Already a Supabase URL or other valid URL - skip
          console.log('Skipping already processed URL:', imageUrl);
          continue;
        }
        
        urlMap.set(imageUrl, permanentUrl);
        console.log('Successfully uploaded:', permanentUrl);
      } catch (error) {
        console.error('Failed to upload image:', error);
        // Keep the original URL if upload fails
      }
    }
    
    // Replace original URLs with permanent Supabase URLs in the editor state
    const updatedEditorState = {
      ...editorState,
      root: replaceImageUrls(editorState.root, urlMap)
    };
    
    return updatedEditorState;
  } catch (error) {
    console.error('Error processing images:', error);
    // Return original state if processing fails
    return editorState;
  }
}
