import { useState } from "react";
import { publicAsset } from "../assets.js";
import "./DiscArtwork.css";

export default function DiscArtwork({ image }) {
  const [failedImage, setFailedImage] = useState(null);
  return (
    <span className="disc-artwork" aria-hidden="true">
      <img className="disc-artwork-surface" src={publicAsset("assets/reference/untitled-disc.webp")} alt="" width="930" height="930" />
      {image && failedImage !== image && (
        <img className="disc-artwork-cover" src={image} alt="" loading="lazy"
          onError={() => setFailedImage(image)} />
      )}
      <span className="disc-artwork-reflection" />
      <span className="disc-artwork-hole" />
    </span>
  );
}
