import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  HeartHandshake, Leaf, MapPin, Clock3, Package, Search, Plus, LogIn,
  LogOut, Utensils, CheckCircle2, Sprout, Users, ArrowRight, X, LoaderCircle,
  LayoutDashboard, HandHeart, ShieldCheck, AlertCircle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const api = axios.create({ baseURL: API });
const categories = ["Meals", "Bakery", "Fruits & Vegetables", "Packaged Food", "Other"];
const blankFood = { title: "", description: "", category: "Meals", quantity: 10, unit: "meal boxes", location: "", pickupDeadline: "" };

function readSession() {
  try {
    const token = localStorage.getItem("sfr_token");
    const user = JSON.parse(localStorage.getItem("sfr_user") || "null");
    if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return { token, user };
  } catch { return { token: null, user: null }; }
}

function App() {
  const [session, setSession] = useState(readSession);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState("marketplace");
  const [modal, setModal] = useState("");
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", role: "donor" });
  const [foodForm, setFoodForm] = useState(blankFood);
  const [submitting, setSubmitting] = useState(false);

  const user = session.user;
  const isLoggedIn = Boolean(session.token && user);

  function showNotice(message, type = "success") {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  }

  async function loadFoods() {
    setLoading(true);
    try {
      const { data } = await api.get("/food", { params: { search: query, category, status: tab === "my-donations" ? "all" : "available", mine: tab === "my-donations" ? "true" : "false" } });
      setFoods(data.foods || []);
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not load food listings. Check the backend connection.", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadFoods(); }, [query, category, tab, session.token]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function saveSession(data) {
    localStorage.setItem("sfr_token", data.token);
    localStorage.setItem("sfr_user", JSON.stringify(data.user));
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    setSession({ token: data.token, user: data.user });
    setModal("");
    showNotice(`Welcome, ${data.user.name}!`);
  }

  async function submitAuth(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload = authMode === "login" ? { email: authForm.email, password: authForm.password } : authForm;
      const { data } = await api.post(endpoint, payload);
      saveSession(data);
    } catch (err) {
      showNotice(err.response?.data?.message || "Unable to authenticate. Is the server running?", "error");
    } finally { setSubmitting(false); }
  }

  function logout() {
    localStorage.removeItem("sfr_token");
    localStorage.removeItem("sfr_user");
    delete api.defaults.headers.common.Authorization;
    setSession({ token: null, user: null });
    setTab("marketplace");
    showNotice("You have been logged out.");
  }

  function openCreate() {
    if (!isLoggedIn) { setAuthMode("login"); setModal("auth"); return; }
    if (user.role !== "donor") { showNotice("Only donor accounts can post surplus food.", "error"); return; }
    setFoodForm(blankFood);
    setModal("food");
  }

  async function submitFood(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post("/food", { ...foodForm, quantity: Number(foodForm.quantity), pickupDeadline: new Date(foodForm.pickupDeadline).toISOString() });
      setFoods(old => tab === "my-donations" ? [data.food, ...old] : old);
      setModal("");
      showNotice("Your food donation has been published!");
      setTab("my-donations");
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not create food listing.", "error");
    } finally { setSubmitting(false); }
  }

  async function claimFood(food) {
    if (!isLoggedIn) { setAuthMode("login"); setModal("auth"); return; }
    if (user.role !== "recipient") { showNotice("Switch to a recipient account to claim food.", "error"); return; }
    setBusyId(food._id);
    try {
      const { data } = await api.post(`/food/${food._id}/claim`);
      showNotice(data.message);
      await loadFoods();
    } catch (err) { showNotice(err.response?.data?.message || "Unable to claim this food.", "error"); }
    finally { setBusyId(""); }
  }

  async function completeRescue(food) {
    setBusyId(food._id);
    try {
      const { data } = await api.patch(`/food/${food._id}/complete`);
      showNotice(data.message);
      await loadFoods();
    } catch (err) { showNotice(err.response?.data?.message || "Could not complete rescue.", "error"); }
    finally { setBusyId(""); }
  }

  const stats = useMemo(() => ({
    available: foods.filter(f => f.status === "available").length,
    claimed: foods.filter(f => ["claimed", "completed"].includes(f.status)).length,
    quantity: foods.filter(f => f.status === "completed").reduce((sum, f) => sum + Number(f.quantity || 0), 0)
  }), [foods]);

  const pageTitle = tab === "my-donations" ? "My donations" : "Rescue food near you";
  const pageSubtitle = tab === "my-donations" ? "Track your surplus food and see who claimed it." : "Good food deserves a second chance. Discover surplus food shared by your community.";

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab("marketplace"); }}>
        <span className="brand-icon"><Leaf size={23} /></span>
        <span>smart<span className="brand-light">rescue</span><small>FOOD FOR GOOD</small></span>
      </a>
      <nav className="nav-links">
        <button className={tab === "marketplace" ? "nav-link active" : "nav-link"} onClick={() => setTab("marketplace")}>Marketplace</button>
        {isLoggedIn && user.role === "donor" && <button className={tab === "my-donations" ? "nav-link active" : "nav-link"} onClick={() => setTab("my-donations")}>My donations</button>}
      </nav>
      <div className="header-actions">
        {isLoggedIn ? <>
          <div className="user-pill"><span className="avatar">{user.name?.[0]?.toUpperCase()}</span><span className="user-name">{user.name}<small>{user.role}</small></span></div>
          <button className="icon-button" title="Log out" onClick={logout}><LogOut size={18}/></button>
        </> : <button className="button button-outline header-login" onClick={() => { setAuthMode("login"); setModal("auth"); }}><LogIn size={17}/> Log in</button>}
        <button className="button button-primary header-donate" onClick={openCreate}><Plus size={18}/> Donate food</button>
      </div>
    </header>

    <main>
      {tab === "marketplace" && <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot"></span> LESS WASTE. MORE CARE.</div>
          <h1>Good food.<br/><span>Better future.</span></h1>
          <p>We connect surplus food with people who need it. A small rescue can make a big difference in someone's day.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={() => document.getElementById("marketplace")?.scrollIntoView({ behavior: "smooth" })}>Explore available food <ArrowRight size={18}/></button>
            <button className="button button-ghost button-large" onClick={openCreate}><HeartHandshake size={18}/> Become a donor</button>
          </div>
          <div className="hero-trust"><span><CheckCircle2 size={16}/> Community powered</span><span><CheckCircle2 size={16}/> Food-first mission</span></div>
        </div>
        <div className="hero-art">
          <div className="art-circle"></div>
          <img src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1100&q=85" alt="Fresh, colorful food ready to be shared" />
          <div className="floating-card float-top"><span className="float-icon"><Sprout size={20}/></span><span><b>Waste less</b><small>Share more goodness</small></span></div>
          <div className="floating-card float-bottom"><span className="float-icon orange"><HeartHandshake size={20}/></span><span><b>Every meal matters</b><small>Rescue food, spread hope</small></span></div>
          <span className="art-sparkle sparkle-one">✳</span><span className="art-sparkle sparkle-two">✳</span>
        </div>
      </section>}

      <section className="impact-strip">
        <div className="impact-item"><span className="impact-icon"><Package size={20}/></span><span><b>{stats.available}</b><small>Available listings</small></span></div>
        <div className="impact-item"><span className="impact-icon"><HandHeart size={20}/></span><span><b>{stats.claimed}</b><small>Claimed / rescued</small></span></div>
        <div className="impact-item"><span className="impact-icon"><Users size={20}/></span><span><b>Community</b><small>Powered by people</small></span></div>
        <div className="impact-note"><Leaf size={17}/> Every rescue starts with sharing.</div>
      </section>

      <section className="market-section" id="marketplace">
        <div className="section-heading">
          <div><div className="eyebrow">THE FOOD BOARD</div><h2>{pageTitle}</h2><p>{pageSubtitle}</p></div>
          {isLoggedIn && user.role === "donor" && <button className="button button-primary" onClick={openCreate}><Plus size={18}/> Add food listing</button>}
        </div>
        <div className="filter-bar">
          <label className="search-box"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search food or location..." /></label>
          <label className="select-wrap"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <div className="filter-count"><span className="online-dot"></span>{foods.length} {foods.length === 1 ? "listing" : "listings"}</div>
        </div>

        {loading ? <div className="state-panel"><LoaderCircle className="spin" size={28}/><b>Finding food to rescue...</b></div> :
          foods.length === 0 ? <div className="empty-state"><span className="empty-icon"><Utensils size={30}/></span><h3>No food listings found</h3><p>{tab === "my-donations" ? "Your donations will appear here after you publish one." : "Try another search, or be the first to share surplus food."}</p><button className="button button-primary" onClick={openCreate}><Plus size={17}/> Donate food</button></div> :
          <div className="food-grid">{foods.map(food => <FoodCard key={food._id} food={food} user={user} busy={busyId === food._id} onClaim={() => claimFood(food)} onComplete={() => completeRescue(food)} />)}</div>}
      </section>

      <section className="how-section">
        <div className="center-heading"><div className="eyebrow">SMALL ACTION, REAL IMPACT</div><h2>How food rescue works</h2><p>Three simple steps bring surplus food to the people who need it.</p></div>
        <div className="steps-grid">
          <Step number="01" icon={<Utensils size={24}/>} title="Share surplus" description="Donors list fresh surplus food, the quantity available and a safe pickup deadline."/>
          <Step number="02" icon={<Search size={24}/>} title="Find & claim" description="Recipients browse available listings and claim food they can collect in time."/>
          <Step number="03" icon={<HeartHandshake size={24}/>} title="Rescue together" description="Coordinate pickup, complete the rescue and keep good food out of waste."/>
        </div>
      </section>
    </main>

    <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-icon"><Leaf size={20}/></span><span>smart<span className="brand-light">rescue</span></span></a><span>Rescuing food. Nourishing communities.</span><span>Made with care <HeartHandshake size={15}/></span></footer>

    {notice && <div className={`toast ${notice.type === "error" ? "toast-error" : ""}`}><span>{notice.type === "error" ? <AlertCircle size={19}/> : <CheckCircle2 size={19}/>}</span>{notice.message}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16}/></button></div>}

    {modal === "auth" && <Modal title={authMode === "login" ? "Welcome back" : "Join the rescue movement"} subtitle={authMode === "login" ? "Log in to continue making a difference." : "Create your account and help good food find a home."} onClose={() => setModal("")}>
      <form className="form-stack" onSubmit={submitAuth}>
        {authMode === "register" && <Field label="Full name"><input required minLength="2" maxLength="80" value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Your name"/></Field>}
        <Field label="Email address"><input type="email" required value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@example.com"/></Field>
        <Field label="Password"><input type="password" minLength="8" required value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="At least 8 characters"/></Field>
        {authMode === "register" && <Field label="I want to"><select value={authForm.role} onChange={e => setAuthForm({ ...authForm, role: e.target.value })}><option value="donor">Donate surplus food</option><option value="recipient">Claim available food</option></select></Field>}
        <button className="button button-primary button-full" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18}/> : authMode === "login" ? <LogIn size={18}/> : <HeartHandshake size={18}/>} {submitting ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="switch-auth">{authMode === "login" ? "New to Smart Rescue?" : "Already have an account?"} <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Create an account" : "Log in"}</button></p>
      <p className="modal-note"><ShieldCheck size={15}/> Passwords are securely hashed on the server.</p>
    </Modal>}

    {modal === "food" && <Modal title="Share surplus food" subtitle="A few details help recipients collect food safely and on time." onClose={() => setModal("")}>
      <form className="form-stack" onSubmit={submitFood}>
        <Field label="Food title"><input required maxLength="100" value={foodForm.title} onChange={e => setFoodForm({ ...foodForm, title: e.target.value })} placeholder="e.g. Fresh veg meal boxes"/></Field>
        <Field label="Description (optional)"><textarea maxLength="600" rows="2" value={foodForm.description} onChange={e => setFoodForm({ ...foodForm, description: e.target.value })} placeholder="Ingredients, packing details, allergens..."/></Field>
        <div className="form-row">
          <Field label="Category"><select value={foodForm.category} onChange={e => setFoodForm({ ...foodForm, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Quantity"><input type="number" required min="1" max="100000" value={foodForm.quantity} onChange={e => setFoodForm({ ...foodForm, quantity: e.target.value })}/></Field>
        </div>
        <Field label="Quantity unit"><select value={foodForm.unit} onChange={e => setFoodForm({ ...foodForm, unit: e.target.value })}><option>meal boxes</option><option>kg</option><option>items</option><option>servings</option></select></Field>
        <Field label="Pickup location"><input required maxLength="160" value={foodForm.location} onChange={e => setFoodForm({ ...foodForm, location: e.target.value })} placeholder="Area, street or landmark"/></Field>
        <Field label="Pickup deadline"><input type="datetime-local" required min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={foodForm.pickupDeadline} onChange={e => setFoodForm({ ...foodForm, pickupDeadline: e.target.value })}/></Field>
        <button className="button button-primary button-full" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {submitting ? "Publishing..." : "Publish food listing"}</button>
      </form>
    </Modal>}
  </div>;
}

function FoodCard({ food, user, busy, onClaim, onComplete }) {
  const status = food.status || "available";
  const iconClass = food.category === "Bakery" ? "bakery" : food.category === "Fruits & Vegetables" ? "produce" : food.category === "Packaged Food" ? "packaged" : "meals";
  const deadline = new Date(food.pickupDeadline);
  const expired = deadline < new Date() && status === "available";
  const canComplete = status === "claimed" && (user?.id === food.donor?._id || user?.id === food.claim?.recipient?._id);
  return <article className="food-card">
    <div className={`food-card-art ${iconClass}`}><span className="food-category">{food.category}</span><span className="food-illustration"><Utensils size={43}/></span><span className="quantity-chip"><Package size={14}/>{food.quantity} {food.unit}</span></div>
    <div className="food-card-body">
      <div className="food-card-top"><span className={`status-pill status-${status}`}>{status === "available" ? "Available" : status === "claimed" ? "Claimed" : status === "completed" ? "Rescued" : "Expired"}</span><span className="posted-by">by {food.donor?.name || "Community donor"}</span></div>
      <h3>{food.title}</h3><p className="food-description">{food.description || "Surplus food shared by a local donor. Help it reach someone who needs it."}</p>
      <div className="food-meta"><span><MapPin size={15}/>{food.location}</span><span><Clock3 size={15}/>{Number.isNaN(deadline.getTime()) ? "Deadline unavailable" : expired ? "Deadline passed" : deadline.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
      {status === "claimed" && <div className="claim-info"><CheckCircle2 size={15}/> Claimed by {food.claim?.recipient?.name || food.claim?.recipientName || "a recipient"}</div>}
      <div className="food-card-actions">
        {status === "available" && !expired ? <button className="button button-primary button-full" onClick={onClaim} disabled={busy || user?.role === "donor" && user?.id === food.donor?._id}>{busy ? <LoaderCircle className="spin" size={17}/> : <HeartHandshake size={17}/>} {user?.role === "donor" && user?.id === food.donor?._id ? "Your donation" : "Claim this food"}</button> :
          canComplete ? <button className="button button-outline button-full" onClick={onComplete} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <CheckCircle2 size={17}/>} Mark rescue complete</button> :
          <button className="button button-disabled button-full" disabled>{status === "completed" ? <><CheckCircle2 size={17}/> Rescue completed</> : expired ? "Pickup deadline passed" : "Already claimed"}</button>}
      </div>
    </div>
  </article>;
}

function Step({ number, icon, title, description }) {
  return <article className="step-card"><span className="step-number">{number}</span><span className="step-icon">{icon}</span><h3>{title}</h3><p>{description}</p></article>;
}
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Modal({ title, subtitle, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button><span className="modal-mark"><Leaf size={22}/></span><h2>{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div>;
}

export default App;
