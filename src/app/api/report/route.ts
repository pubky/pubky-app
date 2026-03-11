import { NextRequest, NextResponse } from 'next/server';
import * as Core from '@/core';
import * as Libs from '@/libs';

/**
 * API Route for post report submission to Chatwoot
 *
 * This endpoint receives report data from the UI and processes it through
 * the controller layer following Franky's architecture.
 *
 * All validation is handled by the controller layer.
 * This route only parses the request body and delegates to the controller.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pubky, postUrl, issueType, reason, name } = body;

    // Delegate to controller - validation happens there
    await Core.ReportController.submit({ pubky, postUrl, issueType, reason, name });

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    return Libs.handleApiError(error, 'api.report.POST');
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST instead.' },
    { status: Libs.HttpStatusCode.METHOD_NOT_ALLOWED },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
