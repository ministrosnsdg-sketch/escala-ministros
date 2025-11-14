import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Ministros from "./pages/Ministros";
import Horarios from "./pages/Horarios";
import Extras from "./pages/Extras";
import Disponibilidade from "./pages/Disponibilidade";
import Escala from "./pages/Escala";
import Exportar from "./pages/Exportar";
import Relatorios from "./pages/Relatorios";
import Perfil from "./pages/Perfil";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/ministros" element={<Ministros />} />
        <Route path="/horarios" element={<Horarios />} />
        <Route path="/extras" element={<Extras />} />
        <Route path="/disponibilidade" element={<Disponibilidade />} />
        <Route path="/escala" element={<Escala />} />
        <Route path="/exportar" element={<Exportar />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}