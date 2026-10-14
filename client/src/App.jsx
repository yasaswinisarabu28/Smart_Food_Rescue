import { useEffect, useMemo, useState } from "react";
import "./App.css";
import axios from "axios";
import { Bell } from "lucide-react";

import {

  HeartHandshake, Leaf, MapPin, Clock3, Package, Search, Plus, LogIn,

  LogOut, Utensils, CheckCircle2, Sprout, Users, ArrowRight, X, LoaderCircle,

  LayoutDashboard, HandHeart, ShieldCheck, AlertCircle, Mail, Truck, ClipboardCheck

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
  const [myClaims, setMyClaims] = useState([]);
  const [donorClaims, setDonorClaims] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState("");
  const [statusBusyId, setStatusBusyId] = useState("");

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



  async function loadNotifications() {
    if (!session.token) {
      setNotifications([]);
      return;
    }
    setNotificationBusy(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications || []);
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not load notifications.", "error");
    } finally {
      setNotificationBusy(false);
    }
  }

  async function markNotificationRead(notification) {
    if (!notification?._id || notification.readAt) return;
    try {
      const { data } = await api.patch(`/notifications/${notification._id}/read`);
      const readAt = data.notification?.readAt || new Date().toISOString();
      setNotifications(current => current.map(item => item._id === notification._id ? { ...item, readAt } : item));
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not mark the notification as read.", "error");
    }
  }

  async function markAllNotificationsRead() {
    if (!notifications.some(item => !item.readAt)) return;
    try {
      const { data } = await api.patch("/notifications/read-all");
      const readAt = data.readAt || new Date().toISOString();
      setNotifications(current => current.map(item => ({ ...item, readAt: item.readAt || readAt })));
      showNotice(data.message || "All notifications marked as read.");
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not mark notifications as read.", "error");
    }
  }

  function formatNotificationDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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



  async function loadMyClaims() {
    if (!isLoggedIn || user?.role !== "recipient") {
      setMyClaims([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/food/my-claims");
      setMyClaims(data.claims || []);
    } catch (err) {
      setMyClaims([]);
      showNotice(
        err.response?.data?.message ||
          "Could not load your claims. Check that the backend has GET /api/food/my-claims enabled.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelClaim(claim) {
    if (!claim?._id) return;
    if (!window.confirm("Cancel this reservation? The quantity will be returned to the available food stock.")) return;

    setCancelBusyId(claim._id);
    try {
      const { data } = await api.patch(`/food/claims/${claim._id}/cancel`);
      await loadMyClaims();
      showNotice(data.message || "Reservation cancelled and quantity returned to stock.");
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not cancel this reservation. Check that the backend cancellation route is enabled.", "error");
    } finally {
      setCancelBusyId("");
    }
  }

  async function loadDonorClaims() {
    if (!isLoggedIn || user?.role !== "donor") {
      setDonorClaims([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get("/food/donor-claims");
      setDonorClaims(data.claims || []);
    } catch (err) {
      setDonorClaims([]);
      showNotice(
        err.response?.data?.message ||
          "Could not load claims for your donations. Check that GET /api/food/donor-claims is enabled.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    if (!isLoggedIn) {
      setFoods([]);
      setMyClaims([]);
      setDonorClaims([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (user?.role === "donor") {
        const [foodResponse, claimResponse] = await Promise.all([
          api.get("/food", { params: { status: "all", mine: "true" } }),
          api.get("/food/donor-claims")
        ]);
        setFoods(foodResponse.data.foods || []);
        setDonorClaims(claimResponse.data.claims || []);
      } else {
        const [foodResponse, claimResponse] = await Promise.all([
          api.get("/food", { params: { status: "all" } }),
          api.get("/food/my-claims")
        ]);
        setFoods(foodResponse.data.foods || []);
        setMyClaims(claimResponse.data.claims || []);
      }
    } catch (err) {
      showNotice(
        err.response?.data?.message || "Could not load dashboard data. Check your backend connection and try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelDonorClaim(claim) {
    if (!claim?._id) return;
    if (!window.confirm("Cancel this reservation on your food donation? The reserved quantity will be returned to your available stock.")) return;

    setCancelBusyId(claim._id);
    try {
      const { data } = await api.patch(`/food/claims/${claim._id}/cancel`);
      await loadDonorClaims();
      showNotice(data.message || "Reservation cancelled and quantity returned to stock.");
    } catch (err) {
      showNotice(
        err.response?.data?.message ||
          "Could not cancel this reservation. Check the backend cancellation route.",
        "error"
      );
    } finally {
      setCancelBusyId("");
    }
  }

  async function updateDonorClaimStatus(claim, status) {
    if (!claim?._id) return;
    const actionText = status === "confirmed" ? "confirm this reservation" : "mark this reservation as picked up";
    if (!window.confirm(`Are you sure you want to ${actionText}?`)) return;

    setStatusBusyId(claim._id);
    try {
      const { data } = await api.patch(`/food/claims/${claim._id}/status`, { status });
      await loadDonorClaims();
      showNotice(data.message || "Claim status updated successfully.");
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not update this claim status.", "error");
    } finally {
      setStatusBusyId("");
    }
  }

  async function completeDonorClaim(claim) {
    if (!claim?._id) return;
    if (!window.confirm("Mark this rescue as completed? This action records the food handover as complete.")) return;

    setStatusBusyId(claim._id);
    try {
      const { data } = await api.patch(`/food/claims/${claim._id}/complete`);
      await loadDonorClaims();
      showNotice(data.message || "Rescue marked as completed.");
      await loadFoods();
    } catch (err) {
      showNotice(err.response?.data?.message || "Could not complete this rescue.", "error");
    } finally {
      setStatusBusyId("");
    }
  }

  useEffect(() => {
    if (session.token) {
      loadNotifications();
    } else {
      setNotifications([]);
      setNotificationOpen(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (tab === "my-claims") {
      loadMyClaims();
    } else if (tab === "donor-claims") {
      loadDonorClaims();
    } else if (tab === "dashboard") {
      loadDashboard();
    } else {
      loadFoods();
    }
  }, [query, category, tab, session.token]);



  useEffect(() => {

    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(null), 4200);

    return () => window.clearTimeout(timer);

  }, [notice]);



  function saveSession(data) {
    if (!data?.token || !data?.user) {
      throw new Error("The server response is missing the login token or user details.");
    }

    localStorage.setItem("sfr_token", data.token);
    localStorage.setItem("sfr_user", JSON.stringify(data.user));
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    setSession({ token: data.token, user: data.user });
    setModal("");
    showNotice(`Welcome, ${data.user.name || "to RescueBite"}!`);
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const email = String(authForm.email || "").trim().toLowerCase();
      const password = String(authForm.password || "");
      const payload = authMode === "login"
        ? { email, password }
        : { ...authForm, name: String(authForm.name || "").trim(), email, password };

      const response = await api.post(endpoint, payload);
      const data = response.data;

      if (!data?.token || !data?.user) {
        throw new Error(
          "The server responded but did not return a token and user. Check that /api/auth/login returns { token, user }."
        );
      }

      saveSession(data);
    } catch (err) {
      const message = err.response?.data?.message ||
        (err.code === "ERR_NETWORK"
          ? `Cannot connect to the backend at ${API}. Start the backend and verify its port and URL.`
          : err.message || "Unable to authenticate. Check your email and password.");
      showNotice(message, "error");
    } finally {
      setSubmitting(false);
    }
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



  async function claimFood(food, quantity) {
    if (!isLoggedIn) {
      setAuthMode("login");
      setModal("auth");
      return;
    }

    if (user.role !== "recipient") {
      showNotice("Switch to a recipient account to claim food.", "error");
      return;
    }

    const availableQuantity = Number(food.remainingQuantity ?? food.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > availableQuantity) {
      showNotice(`Choose a quantity between 1 and ${availableQuantity}.`, "error");
      return;
    }

    setBusyId(food._id);
    try {
      const { data } = await api.post(`/food/${food._id}/claim`, { quantity });
      showNotice(data.message || `Successfully reserved ${quantity} ${food.unit || "items"}.`);
      await loadFoods();
    } catch (err) {
      showNotice(err.response?.data?.message || "Unable to claim this food.", "error");
    } finally {
      setBusyId("");
    }
  }



  const stats = useMemo(() => ({

    available: foods.filter(f => f.status === "available").length,

    claimed: foods.filter(f => ["claimed", "completed"].includes(f.status)).length,

    quantity: foods.filter(f => f.status === "completed").reduce((sum, f) => sum + Number(f.quantity || 0), 0)

  }), [foods]);



  const dashboardClaimList = user?.role === "donor" ? donorClaims : myClaims;
  const activeClaimStatuses = ["reserved", "confirmed", "picked_up"];
  const completedDashboardClaims = dashboardClaimList.filter(claim => claim.status === "completed");
  const activeDashboardClaims = dashboardClaimList.filter(claim => activeClaimStatuses.includes(claim.status));
  const cancelledDashboardClaims = dashboardClaimList.filter(claim => claim.status === "cancelled");
  const availableDashboardFoods = foods.filter(food => food.status === "available" && Number(food.remainingQuantity ?? food.quantity ?? 0) > 0);
  const totalAvailableUnits = foods.reduce((sum, food) => sum + Math.max(0, Number(food.remainingQuantity ?? food.quantity ?? 0) || 0), 0);
  const activeReservedUnits = activeDashboardClaims.reduce((sum, claim) => sum + Math.max(0, Number(claim.quantity) || 0), 0);
  const totalDonatedUnits = foods.reduce((sum, food) => sum + Math.max(0, Number(food.quantity) || 0), 0);
  const statusBreakdown = [
    { key: "reserved", label: "Reserved", count: dashboardClaimList.filter(claim => claim.status === "reserved").length },
    { key: "confirmed", label: "Confirmed", count: dashboardClaimList.filter(claim => claim.status === "confirmed").length },
    { key: "picked_up", label: "Picked up", count: dashboardClaimList.filter(claim => claim.status === "picked_up").length },
    { key: "completed", label: "Completed", count: completedDashboardClaims.length },
    { key: "cancelled", label: "Cancelled", count: cancelledDashboardClaims.length }
  ];
  const highestStatusCount = Math.max(1, ...statusBreakdown.map(item => item.count));
  const dashboardMetrics = user?.role === "donor" ? [
    { label: "Food listings", value: foods.length, note: "Total listings you posted", icon: <Package size={20} />, tint: "green" },
    { label: "Available units", value: totalAvailableUnits, note: "Quantity still available", icon: <Leaf size={20} />, tint: "orange" },
    { label: "Active reservations", value: activeDashboardClaims.length, note: `${activeReservedUnits} units reserved`, icon: <Users size={20} />, tint: "blue" },
    { label: "Rescues completed", value: completedDashboardClaims.length, note: `${completedDashboardClaims.reduce((sum, claim) => sum + (Number(claim.quantity) || 0), 0)} units handed over`, icon: <CheckCircle2 size={20} />, tint: "purple" }
  ] : [
    { label: "Available listings", value: availableDashboardFoods.length, note: "Food listings to explore", icon: <Package size={20} />, tint: "green" },
    { label: "Active reservations", value: activeDashboardClaims.length, note: `${activeReservedUnits} units reserved`, icon: <HandHeart size={20} />, tint: "orange" },
    { label: "Rescues completed", value: completedDashboardClaims.length, note: "Your completed pickups", icon: <CheckCircle2 size={20} />, tint: "blue" },
    { label: "Cancelled claims", value: cancelledDashboardClaims.length, note: "Cancelled reservations", icon: <X size={20} />, tint: "purple" }
  ];
  const recentDashboardClaims = dashboardClaimList.slice(0, 5);

  const pageTitle = tab === "my-donations" ? "My donations" : tab === "my-claims" ? "My food claims" : tab === "donor-claims" ? "Claims received" : "Rescue food near you";

  const pageSubtitle = tab === "my-donations" ? "Track your surplus food and see who claimed it." : tab === "my-claims" ? "Review the food you reserved and its pickup details." : tab === "donor-claims" ? "Review recipient details and move each rescue from reservation to pickup and completion." : "Good food deserves a second chance. Discover surplus food shared by your community.";



  return <div className="app-shell">

    <header className="topbar">

      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab("marketplace"); }}>

        <span className="brand-icon"><Leaf size={23} /></span>

        <span>RescueBite<small className="brand-tagline">Every Meal Deserves a Second Chance</small></span>

      </a>

      <nav className="nav-links">

        <button className={tab === "marketplace" ? "nav-link active" : "nav-link"} onClick={() => setTab("marketplace")}>Marketplace</button>
        {isLoggedIn && <button className={tab === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => setTab("dashboard")}><LayoutDashboard size={15} /> Dashboard</button>}

        {isLoggedIn && user.role === "donor" && <button className={tab === "my-donations" ? "nav-link active" : "nav-link"} onClick={() => setTab("my-donations")}>My donations</button>}
        {isLoggedIn && user.role === "donor" && <button className={tab === "donor-claims" ? "nav-link active" : "nav-link"} onClick={() => setTab("donor-claims")}>Claims received</button>}
        {isLoggedIn && user.role === "recipient" && <button className={tab === "my-claims" ? "nav-link active" : "nav-link"} onClick={() => setTab("my-claims")}>My claims</button>}

      </nav>

      <div className="header-actions">

        {isLoggedIn && <div className="notification-wrap">
          <button
            type="button"
            className="icon-button notification-toggle"
            title="Notifications"
            aria-label={`Notifications${notifications.some(item => !item.readAt) ? `, ${notifications.filter(item => !item.readAt).length} unread` : ""}`}
            aria-expanded={notificationOpen}
            onClick={() => {
              const open = !notificationOpen;
              setNotificationOpen(open);
              if (open) loadNotifications();
            }}
          >
            <Bell size={18} />
            {notifications.some(item => !item.readAt) && <span className="notification-badge">{notifications.filter(item => !item.readAt).length > 99 ? "99+" : notifications.filter(item => !item.readAt).length}</span>}
          </button>
          {notificationOpen && <section className="notification-dropdown" aria-label="Notifications panel">
            <div className="notification-panel-head">
              <div><strong>Notifications</strong><small>{notifications.filter(item => !item.readAt).length} unread</small></div>
              <button type="button" className="notification-mark-all" onClick={markAllNotificationsRead} disabled={!notifications.some(item => !item.readAt)}>Mark all read</button>
            </div>
            <div className="notification-list">
              {notificationBusy && notifications.length === 0 ? (
                <div className="notification-empty">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="notification-empty"><Bell size={22}/><strong>You're all caught up</strong><span>Updates about reservations will appear here.</span></div>
              ) : notifications.map(notification => (
                <button
                  type="button"
                  key={notification._id}
                  className={`notification-item ${notification.readAt ? "is-read" : "is-unread"}`}
                  onClick={() => markNotificationRead(notification)}
                >
                  <span className="notification-item-mark"><Bell size={15}/></span>
                  <span className="notification-item-content">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{formatNotificationDate(notification.createdAt)}</small>
                  </span>
                  {!notification.readAt && <span className="notification-unread-dot" aria-label="Unread"/>}
                </button>
              ))}
            </div>
          </section>}
        </div>}

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



      {tab !== "dashboard" && <section className="impact-strip">

        <div className="impact-item"><span className="impact-icon"><Package size={20}/></span><span><b>{stats.available}</b><small>Available listings</small></span></div>

        <div className="impact-item"><span className="impact-icon"><HandHeart size={20}/></span><span><b>{stats.claimed}</b><small>Claimed / rescued</small></span></div>

        <div className="impact-item"><span className="impact-icon"><Users size={20}/></span><span><b>Community</b><small>Powered by people</small></span></div>

        <div className="impact-note"><Leaf size={17}/> Every rescue starts with sharing.</div>

      </section>}



      {tab === "dashboard" && isLoggedIn && (
        <section className="dashboard-section">
          <div className="dashboard-welcome">
            <div className="dashboard-welcome-copy">
              <span className="eyebrow"><span className="eyebrow-dot"></span> YOUR IMPACT, AT A GLANCE</span>
              <h1>Welcome back, {user.name?.split(" ")[0] || "there"}.</h1>
              <p>{user.role === "donor" ? "Track your shared food, reservations and completed rescues in one place." : "Keep track of your food reservations and discover your next rescue."}</p>
            </div>
            <div className="dashboard-welcome-actions">
              {user.role === "donor" ? (
                <>
                  <button type="button" className="button button-primary" onClick={openCreate}><Plus size={17}/> Donate food</button>
                  <button type="button" className="button button-outline" onClick={() => setTab("donor-claims")}>View claims <ArrowRight size={16}/></button>
                </>
              ) : (
                <>
                  <button type="button" className="button button-primary" onClick={() => setTab("marketplace")}>Find food <ArrowRight size={17}/></button>
                  <button type="button" className="button button-outline" onClick={() => setTab("my-claims")}>My claims</button>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="dashboard-loading"><LoaderCircle className="spin" size={28}/><strong>Loading your dashboard...</strong></div>
          ) : (
            <>
              <div className="dashboard-metrics">
                {dashboardMetrics.map(metric => (
                  <article className={`dashboard-metric-card metric-${metric.tint}`} key={metric.label}>
                    <div className="dashboard-metric-top"><span className="dashboard-metric-icon">{metric.icon}</span><span className="dashboard-metric-role">{user.role === "donor" ? "DONOR" : "RECIPIENT"}</span></div>
                    <div className="dashboard-metric-value">{metric.value}</div>
                    <h3>{metric.label}</h3>
                    <p>{metric.note}</p>
                  </article>
                ))}
              </div>

              <div className="dashboard-content-grid">
                <section className="dashboard-panel">
                  <div className="dashboard-panel-heading">
                    <div><span className="dashboard-panel-kicker">LATEST UPDATES</span><h2>Recent reservations</h2></div>
                    <button type="button" className="dashboard-text-link" onClick={() => setTab(user.role === "donor" ? "donor-claims" : "my-claims")}>View all <ArrowRight size={15}/></button>
                  </div>
                  {recentDashboardClaims.length === 0 ? (
                    <div className="dashboard-empty"><span className="dashboard-empty-icon"><HandHeart size={22}/></span><strong>No reservation activity yet</strong><p>{user.role === "donor" ? "When someone reserves your food, the latest activity will appear here." : "Reserve food from the marketplace and your activity will appear here."}</p><button type="button" className="button button-outline" onClick={() => setTab(user.role === "donor" ? "my-donations" : "marketplace")}>{user.role === "donor" ? "View my donations" : "Browse food"}</button></div>
                  ) : (
                    <div className="dashboard-activity-list">
                      {recentDashboardClaims.map(claim => {
                        const food = claim.food || {};
                        const otherPerson = user.role === "donor" ? (claim.recipient?.name || "Recipient") : (food.donor?.name || "Community donor");
                        const activityDate = new Date(claim.claimedAt || claim.createdAt || Date.now());
                        const dateLabel = Number.isNaN(activityDate.getTime()) ? "Date unavailable" : activityDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
                        return (
                          <div className="dashboard-activity-item" key={claim._id}>
                            <span className={`dashboard-activity-symbol activity-${claim.status || "reserved"}`}>{claim.status === "completed" ? <CheckCircle2 size={18}/> : claim.status === "picked_up" ? <Truck size={18}/> : claim.status === "cancelled" ? <X size={18}/> : <Package size={18}/>}</span>
                            <div className="dashboard-activity-main"><strong>{food.title || "Food reservation"}</strong><span>{user.role === "donor" ? `Reserved by ${otherPerson}` : `Donor: ${otherPerson}`}</span><small>{dateLabel} · {Number(claim.quantity) || 0} {food.unit || "items"}</small></div>
                            <span className={`status-pill status-${claim.status || "reserved"}`}>{(claim.status || "reserved").replaceAll("_", " ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="dashboard-panel dashboard-breakdown-panel">
                  <div className="dashboard-panel-heading"><div><span className="dashboard-panel-kicker">RESCUE WORKFLOW</span><h2>Claim status breakdown</h2></div></div>
                  <div className="dashboard-breakdown-summary"><span><strong>{dashboardClaimList.length}</strong><small>Total reservations</small></span><span><strong>{completedDashboardClaims.reduce((sum, claim) => sum + (Number(claim.quantity) || 0), 0)}</strong><small>Units completed</small></span></div>
                  <div className="dashboard-status-bars">
                    {statusBreakdown.map(item => (
                      <div className="dashboard-status-row" key={item.key}>
                        <div className="dashboard-status-label"><span>{item.label}</span><strong>{item.count}</strong></div>
                        <div className="dashboard-status-track"><span className={`dashboard-status-fill fill-${item.key}`} style={{ width: `${(item.count / highestStatusCount) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="dashboard-tip"><Leaf size={18}/><p>{user.role === "donor" ? `You have shared ${totalDonatedUnits} units across ${foods.length} listing${foods.length === 1 ? "" : "s"}. Every reservation is a step toward less food waste.` : `You currently have ${activeReservedUnits} units in active reservations. Check pickup deadlines in My Claims to keep each rescue on track.`}</p></div>
                </section>
              </div>
            </>
          )}
        </section>
      )}

      {tab !== "dashboard" && <section className={`market-section ${tab === "donor-claims" ? "claims-market-section" : tab === "my-claims" ? "my-claims-market-section" : ""}`} id="marketplace">

        <div className="section-heading">

          <div><div className="eyebrow">THE FOOD BOARD</div><h2>{pageTitle}</h2><p>{pageSubtitle}</p></div>

          {isLoggedIn && user.role === "donor" && <button className="button button-primary" onClick={openCreate}><Plus size={18}/> Add food listing</button>}

        </div>

        {tab === "donor-claims" ? (
          !isLoggedIn || user?.role !== "donor" ? (
            <div className="empty-state"><h3>Log in as a donor</h3><p>Claims on your food donations will appear here.</p><button className="button button-primary" onClick={() => { setAuthMode("login"); setModal("auth"); }}>Log in</button></div>
          ) : loading ? (
            <div className="state-panel"><LoaderCircle className="spin" size={28}/><b>Loading received claims...</b></div>
          ) : donorClaims.length === 0 ? (
            <div className="empty-state"><span className="empty-icon"><ClipboardCheck size={30}/></span><h3>No reservations received yet</h3><p>When a recipient reserves your listed food, their reservation and pickup progress will appear here.</p><button className="button button-primary" onClick={() => setTab("my-donations")}>View my donations</button></div>
          ) : (
            <div className="food-grid">
              {donorClaims.map((claim) => {
                const food = claim.food || {};
                const recipient = claim.recipient || {};
                const status = claim.status || "reserved";
                const deadline = food.pickupDeadline ? new Date(food.pickupDeadline) : null;
                const reservedDate = claim.claimedAt || claim.createdAt;
                const reservedAt = reservedDate ? new Date(reservedDate) : null;
                const busy = statusBusyId === claim._id;
                return (
                  <article className="food-card donor-claim-card" key={claim._id}>
                    <div className={`food-card-art ${food.category === "Bakery" ? "bakery" : food.category === "Fruits & Vegetables" ? "produce" : food.category === "Packaged Food" ? "packaged" : "meals"}`}>
                      <span className="food-category">{food.category || "Food"}</span>
                      <span className="food-illustration"><Users size={43}/></span>
                      <span className="quantity-chip"><Package size={14}/>{claim.quantity} {food.unit || "items"} reserved</span>
                    </div>
                    <div className="food-card-body">
                      <div className="food-card-top">
                        <span className={`status-pill status-${status}`}>{status.replaceAll("_", " ")}</span>
                        <span className="posted-by">{food.title || "Food listing"}</span>
                      </div>
                      <h3>{recipient.name || "Recipient"}</h3>
                      <p className="food-description">Reserved <strong>{claim.quantity} {food.unit || "items"}</strong> of {food.title || "your donation"}.</p>
                      <div className="food-meta">
                        <span><Mail size={15}/>{recipient.email || "Email unavailable"}</span>
                        <span><MapPin size={15}/>{food.location || "Pickup location unavailable"}</span>
                        <span><Clock3 size={15}/>{reservedAt && !Number.isNaN(reservedAt.getTime()) ? `Reserved ${reservedAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Reservation date unavailable"}</span>
                        <span><Truck size={15}/>{deadline && !Number.isNaN(deadline.getTime()) ? `Pickup by ${deadline.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Pickup deadline unavailable"}</span>
                      </div>
                      <div className="claim-workflow-actions">
                        {status === "reserved" && (
                          <div className="claim-action-row">
                            <button type="button" className="button button-primary" disabled={busy || cancelBusyId === claim._id} onClick={() => updateDonorClaimStatus(claim, "confirmed")}>
                              {busy ? <LoaderCircle className="spin" size={17}/> : <CheckCircle2 size={17}/>}
                              {busy ? "Updating..." : "Confirm reservation"}
                            </button>
                            <button type="button" className="button button-cancel" disabled={busy || cancelBusyId === claim._id} onClick={() => cancelDonorClaim(claim)}>
                              {cancelBusyId === claim._id ? <LoaderCircle className="spin" size={17}/> : <X size={17}/>}
                              {cancelBusyId === claim._id ? "Cancelling..." : "Cancel"}
                            </button>
                          </div>
                        )}
                        {status === "confirmed" && (
                          <div className="claim-action-row">
                            <button type="button" className="button button-primary" disabled={busy || cancelBusyId === claim._id} onClick={() => updateDonorClaimStatus(claim, "picked_up")}>
                              {busy ? <LoaderCircle className="spin" size={17}/> : <Truck size={17}/>}
                              {busy ? "Updating..." : "Mark picked up"}
                            </button>
                            <button type="button" className="button button-cancel" disabled={busy || cancelBusyId === claim._id} onClick={() => cancelDonorClaim(claim)}>
                              {cancelBusyId === claim._id ? <LoaderCircle className="spin" size={17}/> : <X size={17}/>}
                              {cancelBusyId === claim._id ? "Cancelling..." : "Cancel"}
                            </button>
                          </div>
                        )}
                        {status === "picked_up" && (
                          <>
                            <button type="button" className="button button-primary button-full" disabled={busy} onClick={() => completeDonorClaim(claim)}>
                              {busy ? <LoaderCircle className="spin" size={17}/> : <ClipboardCheck size={17}/>}
                              {busy ? "Completing..." : "Complete rescue"}
                            </button>
                            <p className="claim-action-note">Cancellation is disabled after pickup.</p>
                          </>
                        )}
                        {["completed", "cancelled", "expired"].includes(status) && (
                          <div className={`claim-info claim-info-${status}`}>
                            <CheckCircle2 size={15}/>
                            {status === "completed" ? "This rescue is completed." : status === "cancelled" ? "This reservation has been cancelled." : "This reservation has expired."}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : tab === "my-claims" ? (
          !isLoggedIn ? (
            <div className="empty-state"><h3>Log in to view your claims</h3><p>Your reserved food and pickup details will appear here.</p><button className="button button-primary" onClick={() => { setAuthMode("login"); setModal("auth"); }}>Log in</button></div>
          ) : loading ? (
            <div className="state-panel"><LoaderCircle className="spin" size={28}/><b>Loading your claims...</b></div>
          ) : myClaims.length === 0 ? (
            <div className="empty-state"><span className="empty-icon"><HandHeart size={30}/></span><h3>No claims yet</h3><p>Browse available food and use the quantity selector to reserve what you need.</p><button className="button button-primary" onClick={() => setTab("marketplace")}>Browse food</button></div>
          ) : (
            <div className="food-grid">
              {myClaims.map((claim) => {
                const food = claim.food || {};
                const status = claim.status || "reserved";
                const deadline = food.pickupDeadline ? new Date(food.pickupDeadline) : null;
                return (
                  <article className="food-card" key={claim._id}>
                    <div className="food-card-art meals">
                      <span className="food-category">{food.category || "Food"}</span>
                      <span className="food-illustration"><Utensils size={43}/></span>
                      <span className="quantity-chip"><Package size={14}/>{claim.quantity} {food.unit || "items"} reserved</span>
                    </div>
                    <div className="food-card-body">
                      <div className="food-card-top">
                        <span className={`status-pill status-${status}`}>{status.replaceAll("_", " ")}</span>
                        <span className="posted-by">by {food.donor?.name || "Community donor"}</span>
                      </div>
                      <h3>{food.title || "Food listing"}</h3>
                      <p className="food-description">{food.description || "Your reserved food listing."}</p>
                      <div className="food-meta">
                        <span><MapPin size={15}/>{food.location || "Location unavailable"}</span>
                        <span><Clock3 size={15}/>{deadline && !Number.isNaN(deadline.getTime()) ? deadline.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Deadline unavailable"}</span>
                      </div>
                      {["reserved", "confirmed"].includes(status) && (
                        <button
                          type="button"
                          className="button button-outline button-full"
                          style={{ marginTop: "16px", borderColor: "#d97757", color: "#a43d24" }}
                          onClick={() => cancelClaim(claim)}
                          disabled={cancelBusyId === claim._id}
                        >
                          {cancelBusyId === claim._id ? <LoaderCircle className="spin" size={17}/> : <X size={17}/>}
                          {cancelBusyId === claim._id ? "Cancelling..." : "Cancel reservation"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div className="filter-bar">
              <label className="search-box"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search food or location..." /></label>
              <label className="select-wrap"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
              <div className="filter-count"><span className="online-dot"></span>{foods.length} {foods.length === 1 ? "listing" : "listings"}</div>
            </div>
            {loading ? <div className="state-panel"><LoaderCircle className="spin" size={28}/><b>Finding food to rescue...</b></div> :
              foods.length === 0 ? <div className="empty-state"><span className="empty-icon"><Utensils size={30}/></span><h3>No food listings found</h3><p>{tab === "my-donations" ? "Your donations will appear here after you publish one." : "Try another search, or be the first to share surplus food."}</p><button className="button button-primary" onClick={openCreate}><Plus size={17}/> Donate food</button></div> :
              <div className="food-grid">{foods.map(food => <FoodCard key={food._id} food={food} user={user} busy={busyId === food._id} onClaim={(quantity) => claimFood(food, quantity)} />)}</div>}
          </>
        )}

      </section>}



      {tab !== "dashboard" && <section className="how-section">

        <div className="center-heading"><div className="eyebrow">SMALL ACTION, REAL IMPACT</div><h2>How food rescue works</h2><p>Three simple steps bring surplus food to the people who need it.</p></div>

        <div className="steps-grid">

          <Step number="01" icon={<Utensils size={24}/>} title="Share surplus" description="Donors list fresh surplus food, the quantity available and a safe pickup deadline."/>

          <Step number="02" icon={<Search size={24}/>} title="Find & claim" description="Recipients browse available listings and claim food they can collect in time."/>

          <Step number="03" icon={<HeartHandshake size={24}/>} title="Rescue together" description="Coordinate pickup, complete the rescue and keep good food out of waste."/>

        </div>

      </section>}

    </main>



    <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-icon"><Leaf size={20}/></span><span>RescueBite</span></a><span>Every Meal Deserves a Second Chance</span><span>Made with care <HeartHandshake size={15}/></span></footer>



    {notice && <div className={`toast ${notice.type === "error" ? "toast-error" : ""}`}><span>{notice.type === "error" ? <AlertCircle size={19}/> : <CheckCircle2 size={19}/>}</span>{notice.message}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16}/></button></div>}



    {modal === "auth" && <Modal title={authMode === "login" ? "Welcome back" : "Join the rescue movement"} subtitle={authMode === "login" ? "Log in to continue making a difference." : "Create your account and help good food find a home."} onClose={() => setModal("")}>

      <form className="form-stack" onSubmit={submitAuth}>

        {authMode === "register" && <Field label="Full name"><input required minLength="2" maxLength="80" value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Your name"/></Field>}

        <Field label="Email address"><input type="email" required value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@example.com"/></Field>

        <Field label="Password"><input type="password" minLength={authMode === "register" ? 8 : undefined} autoComplete={authMode === "login" ? "current-password" : "new-password"} required value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder={authMode === "register" ? "At least 8 characters" : "Enter your password"}/></Field>

        {authMode === "register" && <Field label="I want to"><select value={authForm.role} onChange={e => setAuthForm({ ...authForm, role: e.target.value })}><option value="donor">Donate surplus food</option><option value="recipient">Claim available food</option></select></Field>}

        <button className="button button-primary button-full" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18}/> : authMode === "login" ? <LogIn size={18}/> : <HeartHandshake size={18}/>} {submitting ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}</button>

      </form>

      <p className="switch-auth">{authMode === "login" ? "New to RescueBite?" : "Already have an account?"} <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Create an account" : "Log in"}</button></p>

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



function FoodCard({ food, user, busy, onClaim }) {
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const status = food.status || "available";
  const availableQuantity = Math.max(0, Number(food.remainingQuantity ?? food.quantity) || 0);
  const iconClass = food.category === "Bakery" ? "bakery" : food.category === "Fruits & Vegetables" ? "produce" : food.category === "Packaged Food" ? "packaged" : "meals";
  const deadline = new Date(food.pickupDeadline);
  const expired = deadline < new Date() && status === "available";
  const donorId = typeof food.donor === "object" ? food.donor?._id : food.donor;
  const currentUserId = user?._id || user?.id;
  const isOwnDonation = Boolean(currentUserId && donorId && String(currentUserId) === String(donorId));
  const canClaim = status === "available" && !expired && availableQuantity > 0 && !isOwnDonation;

  useEffect(() => {
    setSelectedQuantity(current => Math.min(Math.max(1, current), Math.max(1, availableQuantity)));
  }, [availableQuantity]);

  return <article className="food-card">
    <div className={`food-card-art ${iconClass}`}>
      <span className="food-category">{food.category}</span>
      <span className="food-illustration"><Utensils size={43}/></span>
      <span className="quantity-chip"><Package size={14}/>{availableQuantity} {food.unit} available</span>
    </div>

    <div className="food-card-body">
      <div className="food-card-top">
        <span className={`status-pill status-${status}`}>{status === "available" ? "Available" : status === "claimed" ? "Claimed" : status === "completed" ? "Rescued" : "Expired"}</span>
        <span className="posted-by">by {food.donor?.name || "Community donor"}</span>
      </div>

      <h3>{food.title}</h3>
      <p className="food-description">{food.description || "Surplus food shared by a local donor. Help it reach someone who needs it."}</p>

      <div className="food-meta">
        <span><MapPin size={15}/>{food.location}</span>
        <span><Clock3 size={15}/>{Number.isNaN(deadline.getTime()) ? "Deadline unavailable" : expired ? "Deadline passed" : deadline.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
      </div>

      <div className="food-card-actions" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
        {canClaim && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Quantity</span>
            <div aria-label="Select quantity" style={{ display: "inline-flex", alignItems: "center", border: "1px solid #d8ded8", borderRadius: "10px", overflow: "hidden", background: "#fff" }}>
              <button type="button" aria-label="Decrease quantity" onClick={() => setSelectedQuantity(q => Math.max(1, q - 1))} disabled={busy || selectedQuantity <= 1} style={{ width: "40px", height: "38px", border: 0, background: "#f5f7f5", fontSize: "22px", cursor: selectedQuantity <= 1 ? "not-allowed" : "pointer", opacity: selectedQuantity <= 1 ? 0.45 : 1 }}>−</button>
              <span aria-live="polite" style={{ minWidth: "42px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{selectedQuantity}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setSelectedQuantity(q => Math.min(availableQuantity, q + 1))} disabled={busy || selectedQuantity >= availableQuantity} style={{ width: "40px", height: "38px", border: 0, background: "#f5f7f5", fontSize: "22px", cursor: selectedQuantity >= availableQuantity ? "not-allowed" : "pointer", opacity: selectedQuantity >= availableQuantity ? 0.45 : 1 }}>+</button>
            </div>
          </div>
        )}

        {canClaim ? (
          <button className="button button-primary button-full" onClick={() => onClaim(selectedQuantity)} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17}/> : <HeartHandshake size={17}/>}
            {busy ? "Reserving..." : `Claim ${selectedQuantity} ${food.unit || "items"}`}
          </button>
        ) : (
          <button className="button button-disabled button-full" disabled>
            {isOwnDonation ? "Your donation" : status === "completed" ? <><CheckCircle2 size={17}/> Rescue completed</> : expired ? "Pickup deadline passed" : status === "claimed" ? "Fully claimed" : "No quantity available"}
          </button>
        )}
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
