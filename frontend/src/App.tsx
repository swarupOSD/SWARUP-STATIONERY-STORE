import { BrowserRouter, Routes, Route, NavLink, Navigate, useParams } from 'react-router-dom';
import { LangProvider } from './i18n/lang';
import { ConfirmProvider, ErrorBoundary, ToastProvider } from './components/ui';
import { Login, Home, More } from './pages/home';
import { Sell } from './pages/sell';
import { Purchase, Khata, CustomerDetail } from './pages/shop';
import { Products, ProductForm } from './pages/products';
import { Reports, Invoices, Personal, SalesHistory } from './pages/rest';
import { Suppliers } from './pages/suppliers';
import { Estimates } from './pages/estimates';
import { Expenses } from './pages/expenses';
import { BuyList } from './pages/buy';
import { SettingsPage, Admin } from './pages/admin';

const authed = () => !!localStorage.getItem('token');
const Guard = ({ el }: { el: JSX.Element }) => (authed() ? el : <Navigate to="/login" />);
const Cust = () => { const { id } = useParams(); return <CustomerDetail id={id!} />; };
const EditP = () => { const { id } = useParams(); return <ProductForm editId={id} />; };

export default function App() {
  return (
    <LangProvider>
      <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <div className="app">
              <nav className="sidebar">
                <div className="sbrand">🪔 Swarup Store</div>
                <NavLink to="/">🏠 Home</NavLink><NavLink to="/sell">🛒 Sell</NavLink><NavLink to="/purchase">📦 Purchase</NavLink>
                <NavLink to="/khata">📒 Khata</NavLink><NavLink to="/products">📦 Products</NavLink><NavLink to="/reports">📊 Reports</NavLink>
                <NavLink to="/sales">🧮 Sales</NavLink><NavLink to="/invoices">🧾 Bills</NavLink><NavLink to="/admin">🛠 Admin</NavLink><NavLink to="/settings">⚙️ Settings</NavLink>
              </nav>
              <div className="main">
                {!navigator.onLine && <div className="offline">📡 Offline — browsing only, money moves need internet.</div>}
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<Guard el={<Home />} />} />
                  <Route path="/sell" element={<Guard el={<Sell />} />} />
                  <Route path="/purchase" element={<Guard el={<Purchase />} />} />
                  <Route path="/khata" element={<Guard el={<Khata />} />} />
                  <Route path="/khata/:id" element={<Guard el={<Cust />} />} />
                  <Route path="/products" element={<Guard el={<Products />} />} />
                  <Route path="/products/new" element={<Guard el={<ProductForm />} />} />
                  <Route path="/products/:id" element={<Guard el={<EditP />} />} />
                  <Route path="/reports" element={<Guard el={<Reports />} />} />
                  <Route path="/invoices" element={<Guard el={<Invoices />} />} />
                  <Route path="/personal" element={<Guard el={<Personal />} />} />
                  <Route path="/sales" element={<Guard el={<SalesHistory />} />} />
              <Route path="/suppliers" element={<Guard el={<Suppliers />} />} />
              <Route path="/estimates" element={<Guard el={<Estimates />} />} />
              <Route path="/expenses" element={<Guard el={<Expenses />} />} />
              <Route path="/buy-list" element={<Guard el={<BuyList />} />} />
                  <Route path="/settings" element={<Guard el={<SettingsPage />} />} />
                  <Route path="/admin" element={<Guard el={<Admin />} />} />
                  <Route path="/more" element={<Guard el={<More />} />} />
                </Routes>
              </div>
              {authed() && (
                <nav className="bottomnav">
                  <NavLink to="/"><span className="e">🏠</span>Home</NavLink>
                  <NavLink to="/sell" className="sell"><span className="e">🛒</span>SELL</NavLink>
                  <NavLink to="/purchase"><span className="e">📦</span>Buy</NavLink>
                  <NavLink to="/khata"><span className="e">📒</span>Khata</NavLink>
                  <NavLink to="/more"><span className="e">⋯</span>More</NavLink>
                </nav>
              )}
            </div>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
      </ErrorBoundary>
    </LangProvider>
  );
}
