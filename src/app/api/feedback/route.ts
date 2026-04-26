import { NextRequest, NextResponse } from 'next/server';
import * as Core from '@/core';
import { HttpStatusCode } from '@/libs/http/http.types';
import { handleApiError } from '@/libs/api/route-error-handler';

/**
 * API Route for feedback submission
 *
 * This endpoint receives feedback from the UI and processes it through
 * the controller layer following Franky's architecture.
 *
 * All validation is handled by the controller layer.
 * This route only parses the request body and delegates to the controller.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pubky, comment, name } = body;

    // Delegate to controller - validation happens there
    await Core.FeedbackController.submit({ pubky, comment, name });

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    return handleApiError(error, 'api.feedback.POST');
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST instead.' },
    { status: HttpStatusCode.METHOD_NOT_ALLOWED },
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
