export const generateTimeBasedE2EAmplifyAppName = () => {
  const now = new Date();

  // Format: YYMMDDHHMMSSNNN (human-readable, sortable)
  const timestamp = [
    String(now.getFullYear()).slice(-2), // YY
    String(now.getMonth() + 1).padStart(2, '0'), // MM
    String(now.getDate()).padStart(2, '0'), // DD
    String(now.getHours()).padStart(2, '0'), // HH
    String(now.getMinutes()).padStart(2, '0'), // MM
    String(now.getSeconds()).padStart(2, '0'), // SS
    String(now.getMilliseconds()).padStart(3, '0'), // NNN
  ].join('');

  return `e2e${timestamp}`;
};
