import { db, auth } from './firebase/config'
import { collection, addDoc, Timestamp, doc, setDoc } from 'firebase/firestore'

export async function ensureUserDocument(userId: string, userEmail: string | null) {
  try {
    const userRef = doc(db, 'users', userId)
    await setDoc(userRef, {
      email: userEmail,
      created_at: Timestamp.now(),
      last_login: Timestamp.now()
    }, { merge: true })
    console.log('✅ User document ensured:', userId)
  } catch (error) {
    console.error('❌ Error ensuring user document:', error)
  }
}

export async function addVideoToFirestore(url: string) {
  const user = auth.currentUser
  if (!user) {
    console.error('❌ No user signed in')
    throw new Error('User must be signed in')
  }

  console.log('✅ User ID:', user.uid)
  console.log('📝 Adding video:', url)

  // Ensure user document exists first
  await ensureUserDocument(user.uid, user.email)

  const itemsRef = collection(db, `users/${user.uid}/items`)
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
      }
    })
    console.log('✅ Document added with ID:', docRef.id)
  } catch (error) {
    console.error('❌ Error adding document:', error)
    throw error
  }
}
