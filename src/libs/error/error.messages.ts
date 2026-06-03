export enum ErrorMessages {
  // User Already Exists
  USER_ALREADY_EXISTS = 'This account has already been created. Please use a different keypair or contact support.',

  // Invalid Signup Token
  INVALID_SIGNUP_TOKEN = 'Invalid invite code. Please check your code and try again.',

  // Signup Failed
  SIGNUP_FAILED = 'Signup failed. Please check your invite code and try again.',

  // Invalid Homeserver Key
  INVALID_HOMESERVER_KEY = 'Invalid homeserver configuration. Please contact support.',

  // Invalid Secret Key
  INVALID_SECRET_KEY = 'Invalid keypair. Please regenerate your keys and try again.',

  // Invalid Public Key
  INVALID_PUBLIC_KEY = 'Invalid public key. Please regenerate your keys and try again.',

  // Not Authenticated
  NOT_AUTHENTICATED = 'Authentication failed. Please regenerate your keys and try again.',

  // Session Expired
  SESSION_EXPIRED = 'Your session has expired. Please sign up again.',

  // Fetch Failed
  FETCH_FAILED = 'Failed to communicate with homeserver. Please try again.',

  // Logout Failed
  LOGOUT_FAILED = 'Could not log out. Try again.',

  // Create Post Failed
  CREATE_POST_FAILED = 'Could not create post. Try again.',

  // Network Error
  NETWORK_ERROR = 'Network error',

  // Timeout
  TIMEOUT = 'Request timed out. Please try again.',

  // Internal Error
  INTERNAL_ERROR = 'Internal server error. Please try again later.',

  // Invalid Input
  INVALID_INPUT = 'Invalid input. Please check your information and try again.',

  // Unexpected Error
  UNEXPECTED_ERROR = 'Unexpected error occurred.',

  // Default/Generic Error
  GENERIC_ERROR = 'Something went wrong',
}
