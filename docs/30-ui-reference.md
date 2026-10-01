# UI / Visual Reference

Two reference mockups were provided (vendor dashboard + customer menu). This doc captures the concrete visual details so the build matches them. Per the PRD, these are **visual direction, not pixel-perfect law** — functional requirements win if they ever conflict — but we should follow them closely.

---

## Design tokens (derived from the mockups)

| Token | Value / description |
|-------|---------------------|
| Primary action | **Red** (buttons, price text, active category underline, +/- circles). Use a single red, e.g. `#E63329`-ish. |
| Positive/active | **Green** (Online status, Accepting Orders toggle, Open POS card, up-trend %, "Secure Payment" shield). |
| Vendor sidebar | **Dark** (near-black) with white text; active item highlighted red. |
| Customer background | Light / white cards on soft gray; food imagery is the hero. |
| Status pills | Color-coded: New (red/pink), Preparing (amber/yellow), Ready (green), Completed (gray/neutral). |
| Cards | Rounded corners, soft shadow, generous padding. |
| Currency | Indian Rupee `₹`, amounts like `₹262.50`. |
| Quantity stepper | Circular red `–` and `+` with number between; `0` default on menu cards. |
| Fonts | Clean sans-serif; large bold headings. |

---

## Mockup 1 — Vendor Dashboard

![Vendor Dashboard mockup](./Mahesh%20Paratha%20Center%20Dashboard.png)

**Left sidebar (dark, fixed):**
- Brand: round logo + "Mahesh Paratha Center".
- Nav items (top→bottom): Dashboard (active, red), Orders (red badge count e.g. `5`), Menu Management, Categories, Reports, Customer POS, QR Code, Business Settings, Location & Hours, Payment Settings, Profile & Team.
- Bottom: Logout, then a "Need Help? / Contact Support" help card.

**Top bar:**
- Left: hamburger/collapse icon.
- Right: `Online ▾` status dropdown (green dot), notification bell with red badge (e.g. `3`), vendor avatar + "Mahesh Paratha Center / Owner ▾".

**Main content:**
- Greeting block: "Good Morning, Mahesh! 👋" + subtitle "Here's what's happening at your business today."
- **4 KPI cards** (each: icon, label, big value, trend): Total Orders `147` `+12% vs yesterday`; Total Revenue `₹18,450` `+18%`; Items Sold `326` `+9%`; Avg. Order Value `₹125` `+6%`. Trends are green with up arrow.
- **Sales Overview** card: combo chart — blue bars = Orders (left axis), red line = Revenue (right axis), x-axis = days; `Last 7 Days ▾` selector; legend Orders/Revenue.
- **Quick Actions** card: Add New Item (green +), Manage Menu, View Orders, View Reports, Business Settings — each a labeled row/button with icon.
- **Top Selling Items** card: ranked list (1–5) with thumbnail, name, "X,XXX sold", revenue, and a horizontal % bar; `Last 30 Days ▾`.
- **Sales Reports** card: mini stats — Total Orders `862`, Total Revenue `₹1,08,500`, Items Sold `1,924`, Completed `842 / 98%`, Cancelled `12 / 1.4%`, Failed Payments `8 / 0.6%`; `Last 7 Days ▾`.
- **Peak Hours** card: bar chart by hour (8 AM–10 PM) with a highlighted peak tooltip "7 PM–8 PM / 83 orders"; `Last 7 Days ▾`.

**Right column:**
- **Store Hours** card: clock icon, "10:00 AM – 11:00 PM", **Accepting Orders** green toggle (ON).
- **Your Ordering QR Code** card: QR image, "Your Ordering URL" field `https://order.foodapp.com/mahesh-paratha` with copy icon, buttons: red **Download QR**, **Print QR**, **Share**.
- **Open Customer POS** card (green accent): "Launch the customer ordering screen on this device (Kiosk Mode)" + **Open POS →**.
- **Recent Orders** card: `View All` link; rows: order no (`#103`), time, items summary, amount, status pill (New / Preparing / Ready / Completed), chevron.
- **Today's Summary** card: "You received 147 orders today. Total Revenue ₹18,450" + three mini stats: Best Selling Item (Methi Paratha, 42 sold), Busiest Hour (7 PM–8 PM, 38 orders), Avg Preparation (10–15 mins).

---

## Mockup 2 — Customer Menu (desktop/tablet width)

![Customer Ordering App mockup](./Mahesh%20Paratha%20Center%20Ordering%20App.png)

**Hero header** (food photo background, dark overlay):
- Round logo, business name "Mahesh Paratha Center", tagline "Fresh • Tasty • Desi Flavour".
- Meta row: 📍 location "Sector 17, Chandigarh", ⭐ rating "4.6 (320+)", 🕐 "Open Now · 10:00 AM – 11:00 PM".
- Top-right **"Scan to Order"** QR chip ("Order from your phone").

**Category tab bar** (icons + labels, active underlined red): All Items, Paratha, Combo, Beverages, Sides.

**Two-column body (desktop):**
- **Left — "Our Menu"** grid (3 across): item cards with image, optional badge (green `Popular`, red `Bestseller`) top-right of image, name, short description, red price, and a circular `–  0  +` stepper (red +/-).
- **Right — persistent Cart panel** (sticky):
  - Header: 🛒 "Your Cart (3)" + `Clear All` (red link).
  - Line items: thumbnail, name, price, `–  qty  +` stepper, 🗑 delete.
  - **Bill Summary**: Subtotal `₹250`, Taxes (5%) `₹12.50`, **Total `₹262.50`** (bold).
  - Red full-width **Proceed to Checkout →**.
  - "🛡 Secure Payment" + payment logos: GPay, PhonePe, Paytm, Cards, UPI.
  - **Estimated Preparation Time** card (red clock): "10 – 15 minutes".

> Note on responsiveness: on **phones**, the right-side cart collapses to a sticky bottom bar / drawer ("X items • ₹Total → View Cart"). The side-by-side cart is the **desktop/kiosk** layout. Both are the same screen at different breakpoints.

---

## Carry-over details to honor in the specs

- Vendor top bar needs an **Online/Offline status dropdown** and a **notifications bell with unread badge** (add to vendor dashboard spec).
- Sidebar order and labels should match the mockup (Menu Management + separate Categories; Location & Hours as its own item; Profile & Team).
- Customer header carries **rating** and **"Scan to Order" chip** (rating is display-only/optional at MVP; the chip is the permanent QR).
- Category tabs have **icons**, not just text.
- Cart shows **Taxes (5%)** line and payment-method logos (GPay/PhonePe/Paytm/Cards/UPI) — ties to the Razorpay/UPI gateway decision.
- Estimated preparation time is shown **in the cart**, not only on confirmation.
- KPI cards show **trend vs yesterday**; dashboard includes **Sales Reports mini-stats** and **Peak Hours** as first-class cards.
