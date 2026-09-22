import { db } from './firebase/config'
import { collection, addDoc, Timestamp } from 'firebase/firestore'

export async function addVideoToFirestore(url: string) {
  console.log('📝 Adding video:', url)

  const itemsRef = collection(db, 'demo_items')
  console.log('📂 Collection path: demo_items')
  
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
