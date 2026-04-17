import { ImageResponse } from "next/og";

export const alt = "Vidya Infinity - Global Education Architects";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1f5fd6 0%, #163da8 100%)",
          color: "#f2f6ff",
          fontFamily: "Arial",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 72, marginBottom: 24, color: "#f8d048" }}>Infinity Education</div>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: 2 }}>VIDYA INFINITY</div>
          <div style={{ fontSize: 44, marginTop: 12, color: "#d8e6ff" }}>Global Education Architects</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
