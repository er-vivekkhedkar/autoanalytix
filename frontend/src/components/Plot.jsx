import React, { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

export default function Plot({ figure, height = 380, innerRef, className, config = {} }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !figure) return;
    Plotly.react(
      ref.current,
      figure.data || [],
      { ...(figure.layout || {}), height, width: undefined, autosize: true },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        ...config,
      }
    );
    if (innerRef) innerRef(ref.current);
    const resize = () => Plotly.Plots.resize(ref.current);
    const ro = new ResizeObserver(resize);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [figure, height]);

  return <div ref={ref} className={className} style={{ width: "100%" }} />;
}

/** Convert a rendered chart DOM node into a PNG data URL. */
export async function chartToImage(node, { title, format = "png", width = 1000, height = 520, scale = 2 } = {}) {
  if (!node) return null;
  const dataUrl = await Plotly.toImage(node, { format, width, height, scale });
  return dataUrl;
}
