import { NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // Extract data from the multipart form
    const userId = formData.get('userId') as string;
    const sessionDataStr = formData.get('sessionData') as string;
    const reviewStatsStr = formData.get('reviewStats') as string;
    const sessionNameFromClient = formData.get('sessionName') as string | null;

    if (!userId || !sessionDataStr) {
      return NextResponse.json(
        { error: 'Missing required fields (userId, sessionData)' },
        { status: 400 }
      );
    }

    // Generate unique session ID based on start time
    const sessionData = JSON.parse(sessionDataStr);
    const timestamp = Date.now();
    const sessionId = `session_${timestamp}`;
    const defaultSessionName = `Session ${new Date(timestamp).toISOString().slice(0, 10)}`;
    const sessionName = sessionNameFromClient && sessionNameFromClient.trim().length > 0
      ? sessionNameFromClient.trim()
      : defaultSessionName;

    // Define storage path: dashboard/data/[userId]/[sessionId]/
    const dataDir = path.join(process.cwd(), 'data', userId, sessionId);
    
    // Ensure directory exists
    await mkdir(dataDir, { recursive: true });

    // 1. Save JSON Data
    const fullSessionInfo = {
      userId,
      sessionId,
      timestamp,
      sessionName,
      reviewStats: reviewStatsStr ? JSON.parse(reviewStatsStr) : null,
      timeline: sessionData
    };
    
    await writeFile(
      path.join(dataDir, 'timeline.json'),
      JSON.stringify(fullSessionInfo, null, 2),
      'utf8'
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Session saved successfully',
      sessionId,
      sessionName,
      path: `data/${userId}/${sessionId}`
    });

  } catch (error) {
    console.error('Failed to save session:', error);
    return NextResponse.json(
      { error: 'Internal server error while saving session data' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const sessionId = searchParams.get('sessionId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const dataDir = path.join(process.cwd(), 'data', userId);

    if (!existsSync(dataDir)) {
      return NextResponse.json([]); // No sessions yet
    }

    if (sessionId) {
      // Fetch specific session
      const sessionPath = path.join(dataDir, sessionId, 'timeline.json');
      if (existsSync(sessionPath)) {
        const rawData = await readFile(sessionPath, 'utf8');
        return NextResponse.json(JSON.parse(rawData));
      } else {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
    }

    const sessionFolders = await readdir(dataDir);
    const sessions = [];

    for (const folder of sessionFolders) {
      const folderPath = path.join(dataDir, folder);
      const stats = await stat(folderPath);

      if (stats.isDirectory()) {
        const timelinePath = path.join(folderPath, 'timeline.json');
        
        if (existsSync(timelinePath)) {
          const rawData = await readFile(timelinePath, 'utf8');
          try {
            const parsed = JSON.parse(rawData);
            sessions.push({
              sessionId: parsed.sessionId,
              timestamp: parsed.timestamp,
              sessionName: parsed.sessionName || `Session ${new Date(parsed.timestamp).toISOString().slice(0, 10)}`,
              reviewStats: parsed.reviewStats || { duration: 0, avg: 0, max: 0 },
            });
          } catch (parseErr) {
            console.error(`Error parsing timeline for ${folder}:`, parseErr);
          }
        }
      }
    }

    // Sort newest first
    sessions.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json(sessions);

  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching sessions' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const userId = body?.userId as string | undefined;
    const sessionId = body?.sessionId as string | undefined;
    const sessionNameRaw = body?.sessionName as string | undefined;

    if (!userId || !sessionId || !sessionNameRaw) {
      return NextResponse.json(
        { error: 'Missing required fields (userId, sessionId, sessionName)' },
        { status: 400 }
      );
    }

    const sessionName = sessionNameRaw.trim();
    if (!sessionName) {
      return NextResponse.json({ error: 'Session name cannot be empty' }, { status: 400 });
    }

    const timelinePath = path.join(process.cwd(), 'data', userId, sessionId, 'timeline.json');
    if (!existsSync(timelinePath)) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const rawData = await readFile(timelinePath, 'utf8');
    const parsed = JSON.parse(rawData);
    parsed.sessionName = sessionName;

    await writeFile(timelinePath, JSON.stringify(parsed, null, 2), 'utf8');

    return NextResponse.json({ success: true, sessionName });
  } catch (error) {
    console.error('Failed to rename session:', error);
    return NextResponse.json(
      { error: 'Internal server error while renaming session' },
      { status: 500 }
    );
  }
}
