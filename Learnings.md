I learned Manifest.json's role in Chrome extensions.

- You can specify permissions
- You can specify scripts / files that will be run
- icon of the extension can be specified there

You Name a shortcut/hot key in manifest file and add listener that looks for that command

Chrome's engine has security rules around PDF and PDf's are actually sandboxed

- access within them are limited compared to a native web page

A challenge of save shortcut was the windows would go out of focus when the shortcut was hit

- The solution that worked among others that failed, was to get the last active windows/tab

Improvements:

- A lot of this was Ai generated.
- It used pure JS, so render function in content.js could be a lot more concise
  - right now it has creating elements for div, li, ...

Traversing DOM using document.createTreeWalker is also an option

- you can think of it like a linked list traversal that will include things based on a provided
  filter
- Treewalker flattens the DOM into a 1D linkedlist
  - walker.nextNode() handles the traversal for you in document orde

- Document Order
  - DFS, Pre-Order traversal

Dangerous Alternative to TreeWalker:

- innerHtml but that destroys the page, the event listeners, and any framework on that page
