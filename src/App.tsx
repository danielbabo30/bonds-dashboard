import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ScreenerPage from './pages/ScreenerPage'
import BondDetailPage from './pages/BondDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScreenerPage />} />
        <Route path="/bond/:securityId" element={<BondDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
