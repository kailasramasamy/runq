// App entry — composes all sections.
const { Nav, Hero, Pillars, Showcase, MobileBand, AIBand, ForCAs, CompareTable, FinalCTA, Footer, useReveal } = window.Sections;

function App() {
  useReveal();
  return (
    <div className="bg-white">
      <Nav />
      <Hero />
      <Pillars />
      <Showcase />
      <MobileBand />
      <AIBand />
      <ForCAs />
      <CompareTable />
      <FinalCTA />
      <Footer />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App />);
