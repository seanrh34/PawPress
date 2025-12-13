'use client';

import { useState, useRef } from 'react';
import { XCircle } from 'react-bootstrap-icons';
import Toggle from './Toggle';

interface FeaturedImageUploadProps {
  value: string | null;
  onChange: (url: string | null, file?: File) => void;
}

export default function FeaturedImageUpload({ value, onChange }: FeaturedImageUploadProps) {
  const [useUpload, setUseUpload] = useState(false);
  const [url, setUrl] = useState(value || '');
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const URL_PATTERN = /^https?:\/\/.+\..+/i;

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    if (newUrl && URL_PATTERN.test(newUrl)) {
      onChange(newUrl);
      setError('');
    } else if (!newUrl) {
      onChange(null);
      setError('');
    } else {
      setError('Please enter a valid URL');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('File size exceeds 10MB. Please choose a smaller image.');
        setFile(undefined);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        onChange(null);
      } else {
        setError('');
        setFile(selectedFile);
        // Create a temporary URL for preview
        const tempUrl = URL.createObjectURL(selectedFile);
        setUrl(tempUrl);
        onChange(tempUrl, selectedFile);
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
    onChange(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="form-label mb-0">Featured Image *</label>
        <Toggle
          checked={useUpload}
          onChange={(checked) => {
            setUseUpload(checked);
            handleRemove();
          }}
        />
        <span className="text-sm text-gray-600">
          {useUpload ? 'File Upload' : 'URL'}
        </span>
      </div>

      {useUpload ? (
        <div>
          <input
            type="file"
            ref={inputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">Maximum file size: 10MB</p>
        </div>
      ) : (
        <div>
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="form-input"
          />
          <p className="text-xs text-gray-500 mt-1">Enter a direct image URL</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {url && !error && (
        <div className="relative inline-block">
          <img
            src={url}
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
