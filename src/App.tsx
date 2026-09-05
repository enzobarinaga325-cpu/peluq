import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";
import { Home } from "@/pages/public/Home";
import { BookingPage } from "@/pages/public/BookingPage";
import { Login } from "@/pages/admin/Login";
import { Dashboard } from "@/pages/admin/Dashboard";
import { Agenda } from "@/pages/admin/Agenda";
import { Reservas } from "@/pages/admin/Reservas";
import { Configuracion } from "@/pages/admin/Configuracion";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>
          <Route path="/:slug" element={<BookingPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
