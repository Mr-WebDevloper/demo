import { Link } from "react-router-dom";
import { useEffect } from "react";
import { analytics } from "../analytics.js";

export default function Home() {
  useEffect(() => {
    analytics.track("home_cta_impression", { placement: "hero" });
  }, []);

  return (
    <section className="hero">
      <p className="hero-eyebrow">Fine dining · Analytics demo</p>
      <h1>Seasonal plates<br />by the water</h1>
      <p className="muted">
        A thoughtfully crafted restaurant that emits page views and interaction
        events into the analytics pipeline in real time.
      </p>
      <Link
        className="btn"
        to="/menu"
        onClick={() => analytics.track("cta_clicked", { target: "view_menu" })}
      >
        Explore the menu
      </Link>
    </section>
  );
}
