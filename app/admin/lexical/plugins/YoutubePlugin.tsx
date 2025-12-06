import React, { useState } from "react";
import { Youtube } from "react-bootstrap-icons";
import Modal from "@/components/Modal";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodes } from "lexical";
import { $createYoutubeNode } from "../nodes/YoutubeNode";

export default function YoutubePlugin() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setURL] = useState("");

  const [editor] = useLexicalComposerContext();

  const onEmbed = () => {
    if (!url) return;
    const match =
      /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(url);

    const id = match && match?.[2]?.length === 11 ? match?.[2] : null;
    if (!id) return;
    editor.update(() => {
      const node = $createYoutubeNode({ id });
      $insertNodes([node]);
    });
    setURL("");
    setIsOpen(false);
  };

  return (
    <div>
      <button
        type="button"
        className="toolbar-item spaced"
        aria-label="Embed Youtube Video"
        onClick={() => setIsOpen(true)}
      >
        <i className="format" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#FF0000" }}>
          <Youtube size={16} />
        </i>
      </button>

      {isOpen && (
        <Modal
          title="Embed Youtube Video"
          onClose={() => setIsOpen(false)}
          footer={
            <button
              type="button"
              className="btn-primary"
              disabled={!url}
              onClick={onEmbed}
            >
              Embed
            </button>
          }
          isOpen={isOpen}
        >
          <input
            type="text"
            className="form-input"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="Add Youtube URL"
          />
        </Modal>
      )}
    </div>
  );
}