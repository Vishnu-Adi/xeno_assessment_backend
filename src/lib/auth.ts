import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import { getPrisma } from './db'
import bcrypt from 'bcryptjs'

const prisma = getPrisma()

// Check if email configuration is available
const isEmailConfigured = process.env.EMAIL_SERVER_HOST && 
  process.env.EMAIL_SERVER_PORT && 
  process.env.EMAIL_SERVER_USER && 
  process.env.EMAIL_SERVER_PASSWORD && 
  process.env.EMAIL_FROM

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  secret: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-development',
  providers: [
    // Only add EmailProvider if email is properly configured
    ...(isEmailConfigured ? [EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    })] : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // For demo purposes, allow specific demo credentials
        if (credentials.email === 'demo@example.com' && credentials.password === 'demo123') {
          // Try to find or create demo user
          let user = await prisma.user.findUnique({
            where: { email: 'demo@example.com' }
          }).catch(() => null)

          if (!user) {
            // Create demo user if it doesn't exist
            try {
              user = await prisma.user.create({
                data: {
                  email: 'demo@example.com',
                  name: 'Demo User'
                }
              })
            } catch (error) {
              console.error('Failed to create demo user:', error)
              // Return a temporary user object for demo purposes
              return {
                id: 'demo-user-id',
                email: 'demo@example.com',
                name: 'Demo User'
              }
            }
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || 'Demo User',
          }
        }

        // For other credentials, check database
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        }).catch(() => null)

        if (!user) {
          return null
        }

        // For simplicity, accept any password that matches 'demo123'
        const isPasswordValid = credentials.password === 'demo123'

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      }
    })
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  },
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session?.user) {
        session.user.id = token.id as string
      }
      return session
    }
  }
}
