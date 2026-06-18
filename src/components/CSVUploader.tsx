import React, { useState, useRef } from "react";
import { parseCSV, build } from "../utils/csvParser";
import { PortfolioModel } from "../types";

interface CSVUploaderProps {
  onModelLoaded: (model: PortfolioModel, fileName: string) => void;
  loadedFileName: string | null;
  fromCache?: boolean;
}

export const CSVUploader: React.FC<CSVUploaderProps> = ({
  onModelLoaded,
  loadedFileName,
  fromCache,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setStatusText("lecture…");
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      try {
        const rows = parseCSV(reader.result);
        const model = build(rows);
        if (model.transactions.length > 0) {
          onModelLoaded(model, file.name);
          setStatusText(null);
        } else {
          setStatusText("aucune ligne « Trading » trouvée");
        }
      } catch {
        setStatusText("erreur de lecture");
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const fileLabel = loadedFileName
    ? `${loadedFileName}${fromCache ? " · cache" : ""}`
    : (statusText ?? "aucun fichier chargé");

  return (
    <div
      id="drop"
      className={`drop${isDragOver ? " over" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <span className="dlabel">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15V4" />
          <path d="M7.5 8.5 12 4l4.5 4.5" />
          <path d="M5 20h14" />
        </svg>
        Charger un CSV
      </span>
      {!loadedFileName && !statusText && (
        <span className="dtext">
          Glisse ton export ici (reste sur l'appareil)
        </span>
      )}
      <span className="dfile" id="dfile">
        {fileLabel}
      </span>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,text/csv"
        style={{ display: "none" }}
      />
    </div>
  );
};
