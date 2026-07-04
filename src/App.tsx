import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";
import { Home } from "@/pages/public/Home";
import { BookingPage } from "@/pages/public/BookingPage";
import { Login } from "@/pages/admin/Login";
import { Dashboard } from "@/pages/admin/Dashboard";
import { Employees } from "@/pages/admin/Employees";
import { MyProfile } from "@/pages/admin/MyProfile";
import { Services } from "@/pages/admin/Services";
import { SchedulePage } from "@/pages/admin/Schedule";
import { Appointments } from "@/pages/admin/Appointments";
import { Recurring } from "@/pages/admin/Recurring";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="turnos" element={<Appointments />} />
            <Route path="turnos-fijos" element={<Recurring />} />
            <Route path="empleados" element={<Employees />} />
            <Route path="mi-perfil" element={<MyProfile />} />
            <Route path="servicios" element={<Services />} />
            <Route path="horarios" element={<SchedulePage />} />
          </Route>
          <Route path="/:slug" element={<BookingPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
