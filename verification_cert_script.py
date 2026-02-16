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
            "certificates": "manage",
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

    # Mock Certificates List
    page.route("**/api/nginx/certificates*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='[{"id": 1, "niceName": "Test Cert", "provider": "letsencrypt", "domainNames": ["example.com"], "expiresOn": "2030-01-01T00:00:00Z"}]'
    ))

    print("Navigating to Certificates page...")
    page.goto("http://localhost:5173/certificates")

    try:
        # Check for table row with "example.com"
        page.wait_for_selector("text=example.com", timeout=10000)
        print("Page loaded and certificate list visible.")
    except Exception as e:
        print(f"Failed to load page content: {e}")
        page.screenshot(path="verification_cert_debug.png")
        browser.close()
        return

    try:
        # Click the Add button
        # Use a generic selector that finds the button with "Certificate" text (likely "Add Certificate")
        add_btn = page.locator("button").filter(has_text="Certificate").first
        add_btn.click()
        print("Clicked Add button.")

        # Wait for dropdown content
        dropdown = page.locator("[role=menu]")
        dropdown.wait_for(state="visible", timeout=2000)

        # Click "Internal Certificate" item
        # We'll try partial text match
        internal_item = page.get_by_role("menuitem").filter(has_text="Internal")
        internal_item.click()
        print("Clicked Internal Certificate menu item.")

        # Wait for modal
        page.wait_for_selector("div[role='dialog']", timeout=5000)
        print("Modal opened.")

        # Look for the Save button specifically
        # It should contain text "Save" (id="save")
        # And should have the pink class

        # We find the button by type submit to be sure
        save_btn = page.locator("div[role='dialog'] button[type='submit']")
        save_btn.wait_for(timeout=3000)

        # Check class
        class_attr = save_btn.get_attribute("class")
        print(f"Save button classes: {class_attr}")

        if "bg-pink-600/90" in class_attr:
             print("SUCCESS: Found Save button with bg-pink-600/90 class.")
             page.screenshot(path="verification_cert_success.png")
        else:
             print(f"FAILURE: Save button does not have expected class. Found: {class_attr}")
             page.screenshot(path="verification_cert_fail_class.png")

    except Exception as e:
        print(f"Interaction failed: {e}")
        page.screenshot(path="verification_interaction_fail.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
