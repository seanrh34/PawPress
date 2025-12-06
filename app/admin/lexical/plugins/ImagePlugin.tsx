import React, { useRef, useState } from "react";
import { ImageFill } from "react-bootstrap-icons";
import Modal from "@/components/Modal";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createImageNode } from "../nodes/ImageNode";
import { $insertNodes } from "lexical";

export default function ImagePlugin() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setURL] = useState("");
  const [file, setFile] = useState<File>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [editor] = useLexicalComposerContext();

  const onAddImage = () => {
    let src = "";
    if (url) src = url;
    if (file) src = URL.createObjectURL(file);

    editor.update(() => {
      const node = $createImageNode({ src, altText: "Dummy text" });
      $insertNodes([node]);
    });
    setFile(undefined);
    setURL("");
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
          const file = e.target.files?.[0];
          if (file) {
            setFile(file);
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
              className="btn-primary"
              disabled={!url && !file}
              onClick={onAddImage}
            >
              Add Image
            </button>
          }
          isOpen={isOpen}
        >
          <input
            type="text"
            className="form-input mb-4"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="Add Image URL"
          />
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => inputRef?.current?.click()}
          >
            {file ? file.name : "Upload Image"}
          </button>
        </Modal>
      )}
    </div>
  );
}