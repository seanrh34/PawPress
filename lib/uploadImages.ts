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
 * Process Lexical editor state: upload base64 images and replace with permanent URLs
 * Note: Images should be converted to base64 format client-side before sending to API
 * Format: { src: "data:image/jpeg;base64,..." }
 * @param editorState - The Lexical SerializedEditorState
 * @returns Updated editor state with permanent image URLs
 */
export async function processAndUploadImages(editorState: SerializedEditorState): Promise<SerializedEditorState> {
  try {
    // Find all image URLs in the editor state
    const imageUrls = findImageNodes(editorState.root);
    console.log('Image URLs to process:', imageUrls);
    // Filter only base64 data URLs
    const base64Images = imageUrls.filter(url => url.startsWith('data:image/'));
    console.log('Base64 images to upload:', base64Images);
    if (base64Images.length === 0) {
      console.log('No base64 images found, skipping upload.');
      return editorState;
    }
    
    // Upload all base64 images and create URL mapping
    const urlMap = new Map<string, string>();
    
    for (const base64Url of base64Images) {
      console.log('Uploading image:', base64Url.substring(0, 30) + '...'); // Log beginning of base64 string
      try {
        // Extract content type from data URL
        const contentTypeMatch = base64Url.match(/data:(image\/[a-z]+);/);
        const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/jpeg';
        
        const permanentUrl = await uploadBase64ToSupabase(base64Url, contentType);
        urlMap.set(base64Url, permanentUrl);
      } catch (error) {
        console.error('Failed to upload image:', error);
        // Keep the base64 URL if upload fails
      }
    }
    
    // Replace base64 URLs with permanent URLs in the editor state
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
