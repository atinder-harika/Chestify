/*
 * Owner: Dhruti Harshadbhai Prajapati
 * Review focus: Authenticated creation of user-owned video processing records.
 */

import { auth, db } from './firebase/config'
import { collection, addDoc, Timestamp } from 'firebase/firestore'

// Verifies Firebase Auth, creates the users/{uid}/items collection reference,
// and writes a processing record for the backend listener to consume.
// Returns the new item's id so the caller can follow its progress.
export async function addVideoToFirestore(url: string): Promise<string> {
  console.log('📝 Adding video:', url)

  const user = auth.currentUser
  if (!user) {
    throw new Error('You must be signed in to add a video.')
  }

  const itemsRef = collection(db, 'users', user.uid, 'items')
  console.log('📂 Collection path:', `users/${user.uid}/items`)
  
  try {
    const docRef = await addDoc(itemsRef, {
      url: url,
      status: 'processing',
      created_at: Timestamp.now(),
      title: 'Processing...',
      summary: '',
      transcript: '',
      category: '',
      tags: [],
      fact_check: {
        status: 'Unverified',
        reason: 'Analysis in progress...',
        source_link: ''
      },
      sources: []
    })
    console.log('✅ Document added with ID:', docRef.id)
    return docRef.id
  } catch (error) {
    console.error('❌ Error adding document:', error)
    throw error
  }
}
