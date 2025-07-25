"use client";
import {
  useEffect,
  useCallback
} from "react";
import DisableDevtool from "disable-devtool";
const DevtoolDetector = () => {
  const freezeWebPage = useCallback(() => {
    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "none";
      document.body.style.overflow = "hidden";
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      overlay.style.color = "white";
      overlay.style.zIndex = "99999";
      overlay.style.display = "flex";
      overlay.style.justifyContent = "center";
      overlay.style.alignItems = "center";
      overlay.style.fontSize = "2em";
      overlay.style.fontFamily = "monospace";
      overlay.style.textAlign = "center";
      overlay.style.padding = "20px";
      overlay.id = "devtool-freeze-overlay";
      document.body.appendChild(overlay);
      let message = "!!! SYSTEM ALERT !!!\n\nAKSES TIDAK SAH: Developer Tools Terdeteksi.\n\nMemulai protokol keamanan: KONEKSI DIPUTUS.\n\nHarap nonaktifkan Developer Tools untuk melanjutkan.\n\nKegagalan untuk mematuhi dapat mengakibatkan pembatasan lebih lanjut.";
      let i = 0;
      let typewritingEffect;
      const typeWriter = () => {
        if (i < message.length) {
          overlay.textContent += message.charAt(i);
          i++;
          typewritingEffect = setTimeout(typeWriter, 50);
        } else {
          clearTimeout(typewritingEffect);
        }
      };
      typeWriter();
      if (typeof console !== "undefined") {
        console.clear();
        console.warn("!!! SYSTEM ALERT !!!");
        console.log("AKSES TIDAK SAH: Developer Tools Terdeteksi.");
        console.info("Memulai protokol keamanan: KONEKSI DIPUTUS.");
        console.warn("Harap nonaktifkan Developer Tools untuk melanjutkan.");
        console.log("Kegagalan untuk mematuhi dapat mengakibatkan pembatasan lebih lanjut.");
      }
      debugger;
    }
  }, []);
  useEffect(() => {
    DisableDevtool({
      ondevtoolopen: freezeWebPage
    });
    const checkWindowSize = () => {
      const threshold = 160;
      if (typeof window !== "undefined" && (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold)) {
        freezeWebPage();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("resize", checkWindowSize);
      checkWindowSize();
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", checkWindowSize);
      }
      const overlay = document.getElementById("devtool-freeze-overlay");
      if (overlay) {
        overlay.remove();
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
      }
    };
  }, [freezeWebPage]);
  return null;
};
export default DevtoolDetector;