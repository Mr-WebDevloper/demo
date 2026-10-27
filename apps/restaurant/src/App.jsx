import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useMemo, useState } from "react";
import Home from "./pages/Home.jsx";
import Menu from "./pages/Menu.jsx";
import Cart from "./pages/Cart.jsx";

export default function App() {
  const [cart, setCart] = useState([]);
  const count = useMemo(() => cart.reduce((n, i) => n + i.qty, 0), [cart]);

  function addItem(item) {
    setCart((prev) => {
      const found = prev.find((p) => p.id === item.id);
      if (found) return prev.map((p) => (p.id === item.id ? { ...p, qty: p.qty + 1 } : p));
      return [...prev, { ...item, qty: 1 }];
    });
  }

  return (
    <>
      <header>
        <Link to="/" className="brand">Harbor <span>Kitchen</span></Link>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/order">
            <span className="cart-badge">
              Order {count > 0 && <span className="badge-count">{count}</span>}
            </span>
          </NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu onAdd={addItem} />} />
          <Route path="/order" element={<Cart cart={cart} setCart={setCart} />} />
        </Routes>
      </main>
    </>
  );
}
