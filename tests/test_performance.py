import pytest
import re
from playwright.sync_api import Page, expect

def test_meditation_playback(page: Page):
    # Mock AudioContext and decodeAudioData to avoid hanging in headless mode
    page.add_init_script("""
        const startTime = Date.now() / 1000;
        window.AudioContext = class {
            constructor() {
                this.destination = {};
            }
            get currentTime() {
                return (Date.now() / 1000) - startTime;
            }
            createGain() {
                return {
                    connect: () => {},
                    gain: { value: 0, setTargetAtTime: () => {}, setValueAtTime: () => {} },
                    disconnect: () => {}
                };
            }
            createPanner() {
                return {
                    connect: () => {},
                    positionX: { value: 0, setTargetAtTime: () => {} },
                    positionY: { value: 0, setTargetAtTime: () => {} },
                    positionZ: { value: 0, setTargetAtTime: () => {} },
                    disconnect: () => {}
                };
            }
            createBiquadFilter() { return { connect: () => {}, frequency: { value: 0 }, gain: { value: 0 } }; }
            createBufferSource() {
                return {
                    connect: () => {},
                    start: () => {},
                    stop: () => {},
                    disconnect: () => {},
                    buffer: null,
                    loop: false,
                    onended: null
                };
            }
            decodeAudioData(buffer) {
                return Promise.resolve({
                    duration: 600, // 10 minutes
                    numberOfChannels: 2,
                    sampleRate: 44100,
                    getChannelData: () => new Float32Array(10)
                });
            }
        };
        window.webkitAudioContext = window.AudioContext;
    """)

    page.goto("http://localhost:8000")

    # Dismiss audio prompt
    page.click("#btnStart")

    # Wait for loading to finish
    expect(page.locator("#voiceLoading")).not_to_be_visible(timeout=10000)

    # Click Play
    page.click("#btnPlay")

    # Verify playing state
    expect(page.locator("#btnPlay")).to_have_text("‖")
    expect(page.locator("#progressFill")).to_have_class(re.compile(r"playing"))

    # Wait for progress
    page.wait_for_timeout(3000)

    # Check progress bar width
    progress_fill = page.locator("#progressFill")
    style = progress_fill.get_attribute("style")
    assert style != "width: 0%;"

    # Check time updated
    current_time = page.locator("#currentTime").text_content()
    assert current_time != "00:00"

    # Pause - force=True because button is animating
    page.click("#btnPlay", force=True)

    # Verify paused state
    expect(page.locator("#btnPlay")).to_have_text("▶")

    # Current behavior: 'playing' class REMAINS when paused
    expect(page.locator("#progressFill")).to_have_class(re.compile(r"playing"))

    # Stop
    page.click("#btnStop")

    # Verify stopped state
    expect(page.locator("#progressFill")).not_to_have_class(re.compile(r"playing"))
    expect(page.locator("#progressFill")).to_have_attribute("style", "width: 0%;")
