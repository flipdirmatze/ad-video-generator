import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import dbConnect from '@/lib/mongoose'
import Video from '@/models/Video'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/media/status
 * Ruft Videos nach Status ab, standardmäßig werden alle Videos zurückgegeben
 */
export async function GET(request: NextRequest) {
  try {
    // Session prüfen
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Nicht autorisiert' },
        { status: 401 }
      )
    }
    
    // URL-Parameter abrufen
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'draft', 'processing', 'complete' oder null für alle

    // Verbindung zur Datenbank herstellen
    await dbConnect()
    
    // Abfrageparameter vorbereiten
    const query: any = { userId: session.user.id }
    
    // Status-Filter hinzufügen, wenn angegeben
    if (status) {
      query.status = status
    }
    
    // Videos des Benutzers abrufen
    const videos = await Video.find(query).sort({ createdAt: -1 })
    
    // Rückmeldung formatieren
    const formattedVideos = videos.map((video: any) => ({
      id: video.id,
      _id: video._id ? video._id.toString() : undefined,
      name: video.name,
      path: video.path,
      url: video.url,
      size: video.size,
      type: video.type,
      status: video.status || 'draft',
      progress: video.progress || 0,
      tags: video.tags || [],
      createdAt: video.createdAt,
      isPublic: video.isPublic
    }));
    
    return NextResponse.json({
      success: true,
      count: videos.length,
      videos: formattedVideos
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Videos nach Status:', error)
    return NextResponse.json(
      { error: 'Fehler beim Abrufen der Videos' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/media/status
 * Aktualisiert den Status eines Videos
 */
export async function PATCH(request: NextRequest) {
  try {
    // Session prüfen
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Nicht autorisiert' },
        { status: 401 }
      )
    }
    
    // Anfragedaten abrufen
    const body = await request.json()
    const { videoId, status, progress } = body
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'Video-ID ist erforderlich' },
        { status: 400 }
      )
    }
    
    // Verbindung zur Datenbank herstellen
    await dbConnect()
    
    // Video finden und sicherstellen, dass es dem Benutzer gehört
    const video = await Video.findOne({ 
      _id: videoId,
      userId: session.user.id
    })
    
    if (!video) {
      return NextResponse.json(
        { error: 'Video nicht gefunden oder keine Berechtigung' },
        { status: 404 }
      )
    }
    
    // Update-Daten vorbereiten
    const updateData: any = {}
    
    if (status) {
      updateData.status = status
    }
    
    if (progress !== undefined) {
      updateData.progress = progress
    }
    
    // Video aktualisieren
    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      { $set: updateData },
      { new: true }
    )
    
    return NextResponse.json({
      success: true,
      video: {
        id: updatedVideo.id,
        _id: updatedVideo._id.toString(),
        name: updatedVideo.name,
        status: updatedVideo.status,
        progress: updatedVideo.progress,
        url: updatedVideo.url
      }
    });
    
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Video-Status:', error)
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren des Videos' },
      { status: 500 }
    )
  }
} 