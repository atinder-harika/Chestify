import { auth, db } from './firebase/config'
import { collection, addDoc, Timestamp } from 'firebase/firestore'

export async function addVideoToFirestore(url: string) {
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
  } catch (error) {
    console.error('❌ Error adding document:', error)
    throw error
  }
}
