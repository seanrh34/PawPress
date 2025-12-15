import React, { useRef, useState } from "react";
import { ImageFill } from "react-bootstrap-icons";
import Modal from "@/components/Modal";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createImageNode } from "../nodes/ImageNode";
import { $insertNodes } from "lexical";
import Toggle from "@/components/Toggle";

export default function ImagePlugin() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setURL] = useState("");
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [useUpload, setUseUpload] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [editor] = useLexicalComposerContext();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
  const URL_PATTERN = /^https?:\/\/.+\..+/i;

  const isValidURL = (urlString: string) => {
    return URL_PATTERN.test(urlString);
  };

  const onAddImage = () => {
    let src = "";
    if (url) {
      src = url;
    } else if (file) {
      // Convert file to base64 for transmission to server
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        editor.update(() => {
          const node = $createImageNode({ src: base64String, altText: altText || "Image" });
          $insertNodes([node]);
        });
      };
      reader.readAsDataURL(file);
      
      // Clear form and close modal
      setFile(undefined);
      setURL("");
      setAltText("");
      setError("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setIsOpen(false);
      return; // Exit early since we're handling async
    }

    // Handle URL case (synchronous)
    if (src) {
      editor.update(() => {
        const node = $createImageNode({ src, altText: altText || "Image" });
        $insertNodes([node]);
      });
    }
    
    setFile(undefined);
    setURL("");
    setAltText("");
    setError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setIsOpen(false);
  };

  return (
    <div>
      <button
        type="button"
        className="toolbar-item spaced"
        aria-label="Add Image"
        onClick={() => setIsOpen(true)}
      >
        <i className="format" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageFill size={16} />
        </i>
      </button>
      <input
        type="file"
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const selectedFile = e.target.files?.[0];
          if (selectedFile) {
            if (selectedFile.size > MAX_FILE_SIZE) {
              setError(`File size exceeds 10MB. Please choose a smaller image.`);
              setFile(undefined);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            } else {
              setError("");
              setFile(selectedFile);
            }
          }
        }}
      />
      {isOpen && (
        <Modal
          title="Add Image"
          onClose={() => setIsOpen(false)}
          footer={
            <button
              type="button"
              className={`btn-primary ${((!url || (url && !isValidURL(url))) && !file) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              disabled={Boolean((!url || (url && !isValidURL(url))) && !file)}
              onClick={onAddImage}
            >
              Add Image
            </button>
          }
          isOpen={isOpen}
        >
          <div className="space-y-4">
            <Toggle 
              leftChoice="Image URL" 
              rightChoice="Upload File"
              checked={useUpload}
              onChange={setUseUpload}
            />

            {!useUpload ? (
              <div>
                <label htmlFor="image-url" className="form-label">
                  Image URL
                </label>
                <input
                  id="image-url"
                  type="text"
                  className="form-input"
                  value={url}
                  onChange={(e) => setURL(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                {url && !isValidURL(url) && (
                  <p className="form-hint text-red-600">Please enter a valid URL (must start with http:// or https://)</p>
                )}
              </div>
            ) : (
              <div>
                <label className="form-label">
                  Upload Image (Max 10MB)
                </label>
                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={() => inputRef?.current?.click()}
                >
                  {file ? file.name : "Choose File"}
                </button>
                {error && (
                  <p className="form-hint text-red-600">{error}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="image-alt" className="form-label">
                Alt Text (Description)
              </label>
              <input
                id="image-alt"
                type="text"
                className="form-input"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe the image for accessibility"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}