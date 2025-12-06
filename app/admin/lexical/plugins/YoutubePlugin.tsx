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

  const YOUTUBE_PATTERN = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*$/;

  const isValidYouTubeURL = (urlString: string) => {
    if (!urlString) return false;
    const match = YOUTUBE_PATTERN.exec(urlString);
    return match && match[2]?.length === 11;
  };

  const onEmbed = () => {
    if (!url || !isValidYouTubeURL(url)) return;
    const match = YOUTUBE_PATTERN.exec(url);
    const id = match?.[2] || null;
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
              className={`btn-primary ${(!url || (url && !isValidYouTubeURL(url))) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              disabled={!url || (url && !isValidYouTubeURL(url))}
              onClick={onEmbed}
            >
              Embed
            </button>
          }
          isOpen={isOpen}
        >
          <div>
            <input
              type="text"
              className="form-input"
              value={url}
              onChange={(e) => setURL(e.target.value)}
              placeholder="Add Youtube URL"
            />
            {url && !isValidYouTubeURL(url) && (
              <p className="form-hint text-red-600">Please enter a valid YouTube URL</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}