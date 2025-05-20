import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-900 py-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-purple-600 mb-4">
            Wähle deinen Plan
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Finde das perfekte Paket für deine Anforderungen an die Videoproduktion
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Starter Plan */}
          <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 transition-transform hover:scale-105">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-2">Starter</h3>
              <div className="flex items-baseline mb-4">
                <span className="text-3xl font-bold text-white">€9</span>
                <span className="text-gray-400 ml-1">/monat</span>
              </div>
              <p className="text-gray-400">Ideal für Einsteiger und gelegentliche Nutzung</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">10 Videos pro Monat</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">Max. 3 Minuten pro Video</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">720p Auflösung</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">2 GB Speicherplatz</span>
              </div>
              <div className="pt-4">
                <Link 
                  href="#" 
                  className="w-full block text-center py-3 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                >
                  Bald verfügbar
                </Link>
              </div>
            </div>
          </div>

          {/* Pro Plan */}
          <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-purple-500 transition-transform hover:scale-105 transform scale-105 z-10">
            <div className="bg-purple-600 py-2 text-center">
              <span className="text-white text-sm font-bold uppercase">Beliebt</span>
            </div>
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <div className="flex items-baseline mb-4">
                <span className="text-3xl font-bold text-white">€29</span>
                <span className="text-gray-400 ml-1">/monat</span>
              </div>
              <p className="text-gray-400">Perfekt für Content-Creator und kleine Teams</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">50 Videos pro Monat</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">Max. 10 Minuten pro Video</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">1080p Auflösung</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">10 GB Speicherplatz</span>
              </div>
              <div className="pt-4">
                <Link 
                  href="#" 
                  className="w-full block text-center py-3 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-purple-700 text-white font-semibold hover:from-purple-600 hover:to-purple-800 transition-colors"
                >
                  Bald verfügbar
                </Link>
              </div>
            </div>
          </div>

          {/* Business Plan */}
          <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 transition-transform hover:scale-105">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-2">Business</h3>
              <div className="flex items-baseline mb-4">
                <span className="text-3xl font-bold text-white">€79</span>
                <span className="text-gray-400 ml-1">/monat</span>
              </div>
              <p className="text-gray-400">Für Unternehmen und professionelle Anwender</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">200 Videos pro Monat</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">Max. 30 Minuten pro Video</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">4K Auflösung</span>
              </div>
              <div className="flex items-start">
                <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="text-gray-300">50 GB Speicherplatz</span>
              </div>
              <div className="pt-4">
                <Link 
                  href="#" 
                  className="w-full block text-center py-3 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                >
                  Bald verfügbar
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="mt-16 text-center max-w-2xl mx-auto">
          <p className="text-gray-400">
            Alle Pläne beinhalten kostenlose Updates und unbegrenzte Bearbeitungen deiner erstellten Videos.
            Die Zahlungsabwicklung erfolgt sicher über Stripe.
          </p>
          <div className="mt-8">
            <Link 
              href="/" 
              className="text-purple-400 hover:text-purple-300 underline"
            >
              Zurück zum Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 