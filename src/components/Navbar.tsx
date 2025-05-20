'use client';

import { useState } from 'react';
import Link from 'next/link';
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
              <Link href="/" className="text-xl font-bold text-white">
                <svg
                  width="180"
                  height="44"
                  viewBox="0 0 180 44"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8"
                >
                  <path
                    d="M16 0C7.164 0 0 7.164 0 16V28C0 36.837 7.164 44 16 44H28C36.837 44 44 36.837 44 28V16C44 7.164 36.837 0 28 0H16Z"
                    fill="url(#paint0_linear_1_3)"
                  />
                  <path
                    d="M16.5 10.7C20.9 4.3 30.5 6.6 32 14.5L21.6 20L28.5 31.5C21.3 35.9 12.6 31.3 12.5 23C12.5 18.3 14 13.7 16.5 10.7Z"
                    fill="white"
                  />
                  <path
                    d="M63.672 31.288C60.776 31.288 58.312 30.472 56.28 28.84C54.248 27.208 53.016 24.968 52.584 22.12H58.504C58.776 23.496 59.448 24.6 60.52 25.432C61.592 26.232 62.952 26.632 64.6 26.632C66.136 26.632 67.352 26.28 68.248 25.576C69.176 24.84 69.64 23.912 69.64 22.792C69.64 21.352 69.08 20.328 67.96 19.72C66.872 19.112 65.144 18.44 62.776 17.704C60.552 17.032 58.792 16.376 57.496 15.736C56.2 15.096 55.064 14.136 54.088 12.856C53.144 11.576 52.672 9.896 52.672 7.816C52.672 6.152 53.112 4.664 53.992 3.352C54.872 2.008 56.152 0.968 57.832 0.232C59.544 -0.504 61.544 -0.872 63.832 -0.872C67.288 -0.872 70.024 -0.04 72.04 1.624C74.088 3.288 75.272 5.624 75.592 8.632H69.8C69.544 7.352 68.904 6.328 67.88 5.56C66.856 4.792 65.528 4.408 63.896 4.408C62.392 4.408 61.224 4.76 60.392 5.464C59.56 6.136 59.144 7.048 59.144 8.2C59.144 9.32 59.496 10.216 60.2 10.888C60.904 11.56 61.768 12.104 62.792 12.52C63.816 12.904 65.192 13.352 66.92 13.864C69.048 14.504 70.744 15.16 72.008 15.832C73.304 16.472 74.44 17.416 75.416 18.664C76.392 19.912 76.88 21.544 76.88 23.56C76.88 25.096 76.44 26.552 75.56 27.928C74.68 29.304 73.384 30.424 71.672 31.288C69.992 31.288 66.6 31.288 63.672 31.288Z"
                    fill="#161616"
                  />
                  <path
                    d="M97.6721 7.128C99.8401 7.128 101.752 7.64 103.408 8.664C105.096 9.688 106.408 11.128 107.344 12.984C108.28 14.84 108.748 16.984 108.748 19.416C108.748 21.848 108.28 23.992 107.344 25.848C106.408 27.704 105.096 29.144 103.408 30.168C101.752 31.192 99.8401 31.704 97.6721 31.704C94.5841 31.704 92.1201 30.664 90.2801 28.584V40.04H83.9361V7.432H90.0241V10.424C90.8881 9.272 91.9921 8.376 93.3361 7.736C94.6801 7.096 96.1281 6.776 97.6721 7.128ZM96.8081 26.344C98.7201 26.344 100.272 25.688 101.464 24.376C102.656 23.064 103.252 21.4 103.252 19.384C103.252 17.368 102.656 15.72 101.464 14.44C100.272 13.128 98.7201 12.472 96.8081 12.472C95.6801 12.472 94.6641 12.76 93.7601 13.336C92.8881 13.88 92.1841 14.648 91.6481 15.64C91.1121 16.632 90.8441 17.832 90.8441 19.24C90.8441 20.648 91.1121 21.864 91.6481 22.888C92.1841 23.88 92.8881 24.664 93.7601 25.24C94.6641 25.784 95.6801 26.344 96.8081 26.344Z"
                    fill="#161616"
                  />
                  <path
                    d="M134.248 7.432V31H128.224V27.88C127.36 29 126.248 29.864 124.888 30.472C123.56 31.08 122.12 31.384 120.568 31.384C118.712 31.384 117.064 30.984 115.624 30.184C114.184 29.352 113.064 28.168 112.264 26.632C111.464 25.096 111.064 23.304 111.064 21.256V7.432H117.408V20.2C117.408 22.024 117.872 23.432 118.8 24.424C119.728 25.416 120.984 25.912 122.568 25.912C124.152 25.912 125.424 25.416 126.384 24.424C127.344 23.432 127.824 22.024 127.824 20.2V7.432H134.248Z"
                    fill="#161616"
                  />
                  <path
                    d="M161.472 19.192C161.472 19.896 161.424 20.632 161.328 21.4H143.936C144.064 23.16 144.656 24.52 145.712 25.48C146.768 26.44 148.08 26.92 149.648 26.92C151.952 26.92 153.568 25.96 154.496 24.04H160.768C160.128 26.152 158.848 27.912 156.928 29.32C155.008 30.696 152.624 31.384 149.776 31.384C147.456 31.384 145.376 30.872 143.536 29.848C141.728 28.824 140.304 27.384 139.264 25.528C138.256 23.672 137.752 21.544 137.752 19.144C137.752 16.712 138.256 14.568 139.264 12.712C140.272 10.856 141.68 9.416 143.488 8.392C145.296 7.368 147.392 6.856 149.776 6.856C152.064 6.856 154.08 7.352 155.824 8.344C157.6 9.336 158.976 10.728 159.952 12.52C160.96 14.28 161.472 16.536 161.472 19.192ZM155.16 17.24C155.128 15.672 154.592 14.424 153.552 13.496C152.512 12.568 151.216 12.104 149.664 12.104C148.176 12.104 146.928 12.568 145.92 13.496C144.912 14.392 144.288 15.64 144.048 17.24H155.16Z"
                    fill="#161616"
                  />
                  <path
                    d="M167.328 3.944C166.352 3.944 165.536 3.624 164.88 2.984C164.256 2.312 163.944 1.496 163.944 0.536C163.944 -0.424 164.256 -1.256 164.88 -1.928C165.536 -2.568 166.352 -2.888 167.328 -2.888C168.272 -2.888 169.056 -2.568 169.68 -1.928C170.336 -1.256 170.664 -0.424 170.664 0.536C170.664 1.496 170.336 2.312 169.68 2.984C169.056 3.624 168.272 3.944 167.328 3.944ZM170.456 7.432V31H164.112V7.432H170.456Z"
                    fill="#161616"
                  />
                  <path
                    d="M185.528 12.92C187.352 8.648 190.936 7.128 194.12 7.128C196.28 7.128 198.2 7.64 199.88 8.664C201.56 9.688 202.872 11.128 203.816 12.984C204.76 14.84 205.232 16.984 205.232 19.416C205.232 21.848 204.76 23.992 203.816 25.848C202.872 27.704 201.56 29.144 199.88 30.168C198.2 31.192 196.28 31.704 194.12 31.704C190.936 31.704 187.352 30.184 185.528 25.912V40.04H179.176V7.432H185.528V12.92ZM193.232 26.344C195.152 26.344 196.704 25.688 197.904 24.376C199.104 23.064 199.704 21.4 199.704 19.384C199.704 17.368 199.104 15.72 197.904 14.44C196.704 13.128 195.152 12.472 193.232 12.472C192.104 12.472 191.08 12.76 190.168 13.336C189.288 13.88 188.576 14.648 188.032 15.64C187.488 16.632 187.216 17.832 187.216 19.24C187.216 20.648 187.488 21.864 188.032 22.888C188.576 23.88 189.288 24.664 190.168 25.24C191.08 25.784 192.104 26.344 193.232 26.344Z"
                    fill="#161616"
                  />
                  <path
                    d="M223.752 31.384C221.368 31.384 219.24 30.872 217.368 29.848C215.528 28.824 214.072 27.384 213 25.528C211.96 23.672 211.44 21.544 211.44 19.144C211.44 16.776 211.976 14.664 213.048 12.808C214.152 10.952 215.64 9.512 217.512 8.488C219.384 7.464 221.528 6.952 223.944 6.952C226.36 6.952 228.504 7.464 230.376 8.488C232.248 9.512 233.72 10.952 234.792 12.808C235.896 14.664 236.448 16.776 236.448 19.144C236.448 21.512 235.88 23.624 234.744 25.48C233.64 27.336 232.136 28.792 230.232 29.848C228.328 30.872 226.168 31.384 223.752 31.384ZM223.752 26.056C224.904 26.056 225.96 25.784 226.92 25.24C227.912 24.664 228.704 23.848 229.296 22.792C229.888 21.736 230.184 20.52 230.184 19.144C230.184 17.096 229.576 15.496 228.36 14.344C227.176 13.16 225.672 12.568 223.848 12.568C222.024 12.568 220.52 13.16 219.336 14.344C218.184 15.496 217.608 17.096 217.608 19.144C217.608 21.192 218.168 22.808 219.288 23.992C220.44 25.176 221.928 26.056 223.752 26.056Z"
                    fill="#161616"
                  />
                  <path
                    d="M256.04 6.952C258.584 6.952 260.648 7.736 262.232 9.304C263.848 10.84 264.656 13.032 264.656 15.88V31H258.344V16.808C258.344 15.112 257.896 13.8 257 12.872C256.104 11.944 254.888 11.48 253.352 11.48C251.816 11.48 250.6 11.944 249.704 12.872C248.808 13.8 248.36 15.112 248.36 16.808V31H242.016V7.432H248.36V10.232C249.192 9.272 250.232 8.536 251.48 8.024C252.76 7.144 254.328 6.952 256.04 6.952Z"
                    fill="#161616"
                  />
                  <defs>
                    <linearGradient
                      id="paint0_linear_1_3"
                      x1="22"
                      y1="0"
                      x2="22"
                      y2="44"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#3B82F6" />
                      <stop offset="1" stopColor="#4F46E5" />
                    </linearGradient>
                  </defs>
                </svg>
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