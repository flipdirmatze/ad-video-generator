'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  // Workflow-Schritte definieren
  const workflowSteps = [
    { number: 1, name: 'Voiceover', path: '/voiceover' },
    { number: 2, name: 'Upload', path: '/upload' },
    { number: 3, name: 'KI-Matching', path: '/script-matcher' },
    { number: 4, name: 'Video-Editor', path: '/editor' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center">
                <Image
                  src="/images/logo.svg"
                  alt="CleverCut Logo"
                  width={150}
                  height={40}
                  priority
                />
              </Link>
            </div>
            
            {/* Desktop Workflow Navigation */}
            {status === 'authenticated' && (
              <div className="hidden sm:ml-6 sm:flex">
                <div className="flex items-center">
                  {workflowSteps.map((step, index) => (
                    <div key={step.path} className="flex items-center">
                      <Link
                        href={step.path}
                        className={`group flex items-center relative`}
                      >
                        <div className={`
                          flex items-center justify-center h-8 w-8 rounded-full mr-2
                          ${isActive(step.path) 
                            ? 'bg-primary text-white'
                            : 'bg-gray-700 text-gray-300 group-hover:bg-gray-600'
                          }
                          transition-colors duration-200
                        `}>
                          {step.number}
                        </div>
                        <span className={`
                          text-sm font-medium 
                          ${isActive(step.path) 
                            ? 'text-white border-b-2 border-primary'
                            : 'text-gray-300 group-hover:text-white'
                          }
                        `}>
                          {step.name}
                        </span>
                      </Link>
                      
                      {/* Arrow between steps - show for all except last item */}
                      {index < workflowSteps.length - 1 && (
                        <svg 
                          className="h-5 w-5 mx-2 text-gray-500" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M9 5l7 7-7 7" 
                          />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {status === 'loading' ? (
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            ) : status === 'authenticated' ? (
              <div className="relative ml-3">
                <div>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                  >
                    <span className="sr-only">Open user menu</span>
                    {session?.user?.image ? (
                      <img
                        className="h-8 w-8 rounded-full"
                        src={session.user.image}
                        alt={session.user.name || 'User'}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium">
                        {session?.user?.name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </button>
                </div>
                {isMenuOpen && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                    <div className="px-4 py-2 text-sm text-gray-300 border-b border-gray-700">
                      <p className="font-medium">{session?.user?.name}</p>
                      <p className="text-gray-400 truncate">{session?.user?.email}</p>
                    </div>
                    <Link
                      href="/my-videos"
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Meine Videos
                    </Link>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        signOut({ callbackUrl: '/' });
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex space-x-4">
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-700"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1">
            {status === 'authenticated' && (
              <>
                {workflowSteps.map((step) => (
                  <Link
                    key={step.path}
                    href={step.path}
                    className={`${
                      isActive(step.path) 
                        ? 'bg-gray-800 text-white border-l-4 border-primary pl-2' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    } flex items-center px-3 py-2 rounded-md text-base font-medium`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className={`
                      flex items-center justify-center h-6 w-6 rounded-full mr-2 text-sm
                      ${isActive(step.path) 
                        ? 'bg-primary text-white'
                        : 'bg-gray-700 text-gray-300'
                      }
                    `}>
                      {step.number}
                    </div>
                    {step.name}
                  </Link>
                ))}
                <Link
                  href="/my-videos"
                  className={`${
                    isActive('/my-videos') 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  } block px-3 py-2 rounded-md text-base font-medium`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Meine Videos
                </Link>
              </>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-gray-700">
            {status === 'authenticated' ? (
              <>
                <div className="flex items-center px-5">
                  <div className="flex-shrink-0">
                    {session?.user?.image ? (
                      <img
                        className="h-10 w-10 rounded-full"
                        src={session.user.image}
                        alt={session.user.name || 'User'}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium">
                        {session?.user?.name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-white">{session?.user?.name}</div>
                    <div className="text-sm font-medium text-gray-400">{session?.user?.email}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    href="/profile"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Your Profile
                  </Link>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      signOut({ callbackUrl: '/' });
                    }}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-1 px-3">
                <Link
                  href="/auth/signin"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
} 