'use client';

import { useState, useRef } from 'react';
import { XCircle } from 'react-bootstrap-icons';
import Toggle from './Toggle';

interface FeaturedImageUploadProps {
  value: string | null;
  onChange: (url: string, file?: File) => void;
}

export default function FeaturedImageUpload({ value, onChange }: FeaturedImageUploadProps) {
  const [useUpload, setUseUpload] = useState(false);
  const [url, setUrl] = useState(value || "");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const URL_PATTERN = /^https?:\/\/.+\..+/i;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('File size exceeds 10MB. Please choose a smaller image.');
        setFile(undefined);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      } else {
        setError('');
        setFile(selectedFile);
        onChange('', selectedFile);
      }
    }
  };

  const handleRemove = () => {
    setUrl('');
    setFile(undefined);
    setError('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="form-label mb-0">Featured Image *</label>
      </div>
      <Toggle
        leftChoice="Image URL" 
        rightChoice="Upload File"
        checked={useUpload}
        onChange={setUseUpload}
      />
      {!useUpload ? (
        <div>
          <input
            type="text"
            className="form-input"
            value={url}
            onChange={(e) => {
              const newUrl = e.target.value;
              setUrl(newUrl);
              if (newUrl && URL_PATTERN.test(newUrl)) {
                onChange(newUrl);
              }
            }}
            placeholder="https://example.com/image.jpg"
          />
          <p className="text-xs text-gray-500 mt-1">Enter a direct image URL</p>
          {url && !URL_PATTERN.test(url) && (
            <p className="text-sm text-red-600">Please enter a valid URL</p>
          )}
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => inputRef?.current?.click()}
          >
            {file ? file.name : "Choose File"}
          </button>
          <input
            type="file"
            ref={inputRef}
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <p className="text-xs text-gray-500 mt-1">Maximum file size: 10MB</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {((url && URL_PATTERN.test(url)) || file) && !error && (
        <div className="relative inline-block">
          <img
            src={file ? URL.createObjectURL(file) : url}
            alt="Featured image preview"
            className="max-w-xs max-h-48 border border-gray-300 object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
            aria-label="Remove image"
          >
            <XCircle size={24} className="text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
}
