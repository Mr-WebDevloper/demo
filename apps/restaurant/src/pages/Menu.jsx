import { useEffect, useState } from "react";
import { analytics } from "../analytics.js";

const api = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Free-to-use Unsplash food images matched to each dish id
const DISH_IMAGES = {
  bruschetta:  "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=480&q=80&fit=crop",
  burrata:     "https://images.unsplash.com/photo-1615361200141-f45040f367be?w=480&q=80&fit=crop",
  soup:        "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=480&q=80&fit=crop",
  margherita:  "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=480&q=80&fit=crop",
  carbonara:   "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=480&q=80&fit=crop",
  risotto:     "https://images.unsplash.com/photo-1633964913295-ceb43826e7c7?w=480&q=80&fit=crop",
  salmon:      "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=480&q=80&fit=crop",
  steak:       "https://images.unsplash.com/photo-1558030006-450675393462?w=480&q=80&fit=crop",
  salad:       "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=480&q=80&fit=crop",
  caesar:      "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=480&q=80&fit=crop",
  tiramisu:    "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=480&q=80&fit=crop",
  pannacotta:  "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=480&q=80&fit=crop",
  lava:        "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=480&q=80&fit=crop",
};

const CATEGORY_ORDER = ["Starters", "Mains", "Salads", "Desserts"];

export default function Menu({ onAdd }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    analytics.track("menu_viewed");
    fetch(`${api}/api/menu`)
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .catch(() => setError("Could not load the menu. Is the API running?"));
  }, []);

  const categories = ["All", ...CATEGORY_ORDER.filter((c) =>
    items.some((i) => i.category === c)
  )];

  const filtered = activeCategory === "All"
    ? items
    : items.filter((i) => i.category === activeCategory);

  // Group by category for "All" view
  const groups = activeCategory === "All"
    ? CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c)).map((c) => ({
        label: c,
        dishes: items.filter((i) => i.category === c),
      }))
    : [{ label: activeCategory, dishes: filtered }];

  return (
    <section>
      <div className="section-header">
        <h1>Our Menu</h1>
        <span className="section-label">{items.length} dishes</span>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* Category filter pills */}
      {items.length > 0 && (
        <div className="category-pills">
          {categories.map((c) => (
            <button
              key={c}
              className={`pill ${activeCategory === c ? "pill-active" : ""}`}
              onClick={() => setActiveCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Grouped dish grid */}
      {groups.map(({ label, dishes }) => (
        <div key={label} className="menu-group">
          <h2 className="menu-group-title">{label}</h2>
          <div className="grid">
            {dishes.map((item) => (
              <article className="dish-card" key={item.id}>
                <div className="dish-img-wrap">
                  <img
                    src={DISH_IMAGES[item.id]}
                    alt={item.name}
                    className="dish-img"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </div>
                <div className="dish-body">
                  <h3 className="dish-name">{item.name}</h3>
                  <p className="dish-desc muted">{item.description}</p>
                  <div className="dish-footer">
                    <span className="price">${(item.priceCents / 100).toFixed(2)}</span>
                    <button
                      onClick={() => {
                        analytics.track("add_to_cart", { itemId: item.id, priceCents: item.priceCents });
                        onAdd(item);
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
