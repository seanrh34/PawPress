'use client';

import { useState, useRef } from 'react';
import { FiUpload, FiXCircle } from 'react-icons/fi';
import Toggle from './Toggle';

interface FeaturedImageUploadProps {
  value: string | null;
  onChange: (url: string, file?: File, isExternalUrl?: boolean) => void;
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
          <label htmlFor="featured-image-url" className="sr-only">
            Image URL
          </label>
          <input
            type="text"
            id="featured-image-url"
            className="form-input"
            value={url}
            onChange={(e) => {
              const newUrl = e.target.value;
              setUrl(newUrl);
              if (newUrl && URL_PATTERN.test(newUrl)) {
                onChange(newUrl, undefined, true);
              }
            }}
            placeholder="https://example.com/image.jpg"
          />
          <p className="admin-hint">Enter a direct image URL</p>
          {url && !URL_PATTERN.test(url) && (
            <p className="admin-error mt-1">Please enter a valid URL</p>
          )}
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary w-full"
            onClick={() => inputRef?.current?.click()}
          >
            <FiUpload size={16} aria-hidden="true" />
            {file ? file.name : "Choose File"}
          </button>
          <input
            type="file"
            ref={inputRef}
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
            aria-label="Upload featured image file"
          />
          <p className="admin-hint">Maximum file size: 10MB</p>
        </div>
      )}

      {error && (
        <p className="admin-error">{error}</p>
      )}

      {((url && URL_PATTERN.test(url)) || file) && !error && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file ? URL.createObjectURL(file) : url}
            alt="Featured image preview"
            className="max-h-48 max-w-xs rounded-[var(--radius-control)] border border-rail object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 rounded-full border border-rail bg-surface p-1 shadow-sm"
            aria-label="Remove image"
          >
            <FiXCircle size={18} className="text-cancelled" />
          </button>
        </div>
      )}
    </div>
  );
}
