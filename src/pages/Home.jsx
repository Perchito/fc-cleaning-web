import Hero from '../sections/Hero.jsx'
// Trust bar banner (client names) commented out — uncomment this line to restore
// import TrustBar from '../sections/TrustBar.jsx'
import WhyFC from '../sections/WhyFC.jsx'
import Services from '../sections/Services.jsx'
import Process from '../sections/Process.jsx'
import CtaBand from '../components/CtaBand.jsx'

export default function Home() {
  return (
    <>
      <Hero />
      {/* Trust bar banner (client names) commented out — uncomment to restore
      <TrustBar />
      */}
      <WhyFC />
      <Services />
      <Process />
      <CtaBand />
    </>
  )
}