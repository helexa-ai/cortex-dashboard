import { BrowserRouter, Routes, Route } from "react-router-dom";
import ThemeProvider from "./layout/ThemeProvider";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="d-flex flex-column min-vh-100">
          <Header />

          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>

          <Footer />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
