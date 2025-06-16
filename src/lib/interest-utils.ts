/**
 * Utility functions for interest tracking
 * Demonstrates how the comma-separated email format works
 */

/**
 * Parse interests string from Notion rich text field
 * Format: ",email@example.com,another@example.com,third@example.com"
 */
export function parseInterests(interestsText: string): string[] {
  if (!interestsText || !interestsText.trim()) {
    return [];
  }

  // Remove leading/trailing commas and split by comma
  const emails = interestsText
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  return emails;
}

/**
 * Format interests array to Notion rich text format
 * Format: ",email@example.com,another@example.com,third@example.com"
 */
export function formatInterests(interests: string[]): string {
  if (!interests || interests.length === 0) {
    return "";
  }

  return "," + interests.join(",");
}

/**
 * Add a user to the interests list
 */
export function addUserToInterests(
  currentInterests: string[],
  userEmail: string
): string[] {
  if (!currentInterests.includes(userEmail)) {
    return [...currentInterests, userEmail];
  }
  return currentInterests;
}

/**
 * Remove a user from the interests list
 */
export function removeUserFromInterests(
  currentInterests: string[],
  userEmail: string
): string[] {
  return currentInterests.filter((email) => email !== userEmail);
}

/**
 * Check if a user is interested in a post
 */
export function isUserInterested(
  interests: string[],
  userEmail: string
): boolean {
  return interests.includes(userEmail);
}

// Example usage and demonstration
if (typeof window === "undefined") {
  // Only run examples on server-side to avoid console spam in browser
  console.log("\n=== Interest Tracking Examples ===");

  // Example 1: Starting with no interests
  console.log("\n1. Starting with no interests:");
  let interests: string[] = [];
  console.log("Initial interests:", interests);

  // Add first user
  interests = addUserToInterests(interests, "user1@example.com");
  console.log("After adding user1:", interests);
  console.log("Formatted for Notion:", formatInterests(interests));

  // Example 2: Adding more users
  console.log("\n2. Adding more users:");
  interests = addUserToInterests(interests, "user2@example.com");
  interests = addUserToInterests(interests, "user3@example.com");
  console.log("After adding user2 and user3:", interests);
  console.log("Formatted for Notion:", formatInterests(interests));

  // Example 3: Parsing from Notion format
  console.log("\n3. Parsing from Notion format:");
  const notionFormat = ",user1@example.com,user2@example.com,user3@example.com";
  const parsed = parseInterests(notionFormat);
  console.log("Notion format:", notionFormat);
  console.log("Parsed interests:", parsed);

  // Example 4: Removing a user
  console.log("\n4. Removing a user:");
  const afterRemoval = removeUserFromInterests(parsed, "user2@example.com");
  console.log("After removing user2:", afterRemoval);
  console.log("Formatted for Notion:", formatInterests(afterRemoval));

  // Example 5: Checking if user is interested
  console.log("\n5. Checking user interest:");
  console.log(
    "Is user1 interested?",
    isUserInterested(afterRemoval, "user1@example.com")
  );
  console.log(
    "Is user2 interested?",
    isUserInterested(afterRemoval, "user2@example.com")
  );

  console.log("\n=== End Examples ===\n");
}
