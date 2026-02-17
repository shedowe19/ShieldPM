from playwright.sync_api import sync_playwright
import time
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()

    user_json = json.dumps({
        "id": 1,
        "name": "Admin",
        "email": "admin@example.com",
        "roles": ["admin"],
        "permissions": {
            "proxy_hosts": "manage",
            "access_lists": "manage"
        }
    })

    # Mock Health Check
    page.route("**/api/", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"status": "OK", "setup": true, "version": "4.1.0"}'
    ))

    # Mock Refresh Token (Session Check)
    page.route("**/api/tokens", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=f'{{"token": "fake-token", "user": {user_json}}}'
    ))

    # Mock User Me
    page.route("**/api/users/me*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=user_json
    ))

    # Mock Proxy Hosts (Empty List)
    # The API returns { "data": [], "pagination": { "page": 1, "limit": 10, "total": 0 } }
    page.route("**/api/nginx/proxy-hosts*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"data": [], "pagination": {"page": 1, "limit": 10, "total": 0}}'
    ))

    print("Navigating to Proxy Hosts page...")
    page.goto("http://localhost:5173/nginx/proxy")

    try:
        # Wait for the "Showing" text
        # It should be "Showing 0-0 of 0" or similar depending on implementation
        # Our implementation: "Showing 0-0 of 0"
        page.wait_for_selector("text=Showing 0-0 of 0", timeout=10000)
        print("SUCCESS: Found 'Showing 0-0 of 0' text.")

        # Check Next button state
        # It should be disabled.
        # Button with text "Next"
        next_btn = page.get_by_role("button", name="Next")

        if next_btn.is_disabled():
             print("SUCCESS: Next button is disabled.")
        else:
             print("FAILURE: Next button is enabled.")

        page.screenshot(path="verification_pagination_success.png")

    except Exception as e:
        print(f"Verification failed: {e}")
        page.screenshot(path="verification_pagination_fail.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
