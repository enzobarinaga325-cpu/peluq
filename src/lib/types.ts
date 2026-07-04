export type Employee = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  logo_url: string | null;
  background_url: string | null;
  active: boolean;
  created_at: string;
};

export type Service = {
  id: string;
  employee_id: string;
  name: string;
  price: number;
  duration_minutes: number;
  active: boolean;
  created_at: string;
};

export type Schedule = {
  id: string;
  employee_id: string;
  day_of_week: number; // 0 = domingo .. 6 = sábado
  start_time: string; // "HH:MM:SS"
  end_time: string;
  active: boolean;
};

export type ScheduleException = {
  id: string;
  employee_id: string;
  date: string; // "YYYY-MM-DD"
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type AppointmentStatus = "confirmado" | "completado" | "cancelado";

export type Appointment = {
  id: string;
  employee_id: string;
  service_id: string;
  recurring_id: string | null;
  client_name: string;
  client_phone: string;
  date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  price: number | null;
  created_at: string;
};

export type RecurringAppointment = {
  id: string;
  employee_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  day_of_week: number;
  start_time: string;
  active: boolean;
  created_at: string;
};

export type BusySlot = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
};
