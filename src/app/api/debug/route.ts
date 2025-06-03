import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import * as glob from 'glob'

// Define the output directory structure
const RESULTS_DIR = '.results'
const MULTI_DIR = 'multi'

/**
 * Debug endpoint to help diagnose issues with the comparison data
 */
export async function GET(request: NextRequest) {
  // Only available in development for security
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Debug endpoint only available in development' }, { status: 403 })
  }
  
  const action = request.nextUrl.searchParams.get('action')
  
  switch (action) {
    case 'check-directory':
      return checkDirectory()
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}

/**
 * Checks the structure of the results directory
 */
async function checkDirectory() {
  try {
    const rootDir = process.cwd()
    const resultsDir = path.join(rootDir, RESULTS_DIR)
    const multiDir = path.join(resultsDir, MULTI_DIR)
    
    // Check if directories exist
    const dirInfo = {
      rootDir: {
        path: rootDir,
        exists: fs.existsSync(rootDir)
      },
      resultsDir: {
        path: resultsDir,
        exists: fs.existsSync(resultsDir)
      },
      multiDir: {
        path: multiDir,
        exists: fs.existsSync(multiDir)
      }
    }
    
    // Get all files in multiDir if it exists
    let files: string[] = []
    if (dirInfo.multiDir.exists) {
      files = glob.sync(path.join(multiDir, '*.json'))
    }
    
    // Check content of first file if any exist
    let sampleFileContent = null
    if (files.length > 0) {
      try {
        const content = fs.readFileSync(files[0], 'utf-8')
        const parsed = JSON.parse(content)
        
        // Create a structure summary rather than showing the whole content
        sampleFileContent = {
          filename: path.basename(files[0]),
          hasModels: !!parsed.models,
          modelCount: parsed.models?.length || 0,
          hasSimilarityMatrix: !!parsed.similarityMatrix,
          matrixSize: parsed.similarityMatrix ? Object.keys(parsed.similarityMatrix).length : 0,
          hasPerPromptSimilarities: !!parsed.perPromptSimilarities,
          promptCount: parsed.perPromptSimilarities ? Object.keys(parsed.perPromptSimilarities).length : 0
        }
      } catch (error) {
        sampleFileContent = {
          error: error instanceof Error ? error.message : 'Error reading file'
        }
      }
    }
    
    return NextResponse.json({
      dirInfo,
      fileCount: files.length,
      fileList: files.map(f => path.basename(f)),
      sampleFileContent
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 