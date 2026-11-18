import AppKit
import Foundation

struct WheelBot: Decodable {
  let id: String
  let name: String
  let isPinned: Bool
  let iconPath: String
  let color: String?
}

struct WheelRequest: Decodable {
  let bots: [WheelBot]
  let previewPath: String?
}

private let pageSize = 6
private let gold = NSColor(srgbRed: 0.90, green: 0.71, blue: 0.33, alpha: 1)
private let muted = NSColor(srgbRed: 0.60, green: 0.65, blue: 0.67, alpha: 1)

func finish(_ id: String? = nil) {
  let result: [String: Any] = ["selectedId": id as Any? ?? NSNull()]
  let data = try! JSONSerialization.data(withJSONObject: result)
  print(String(decoding: data, as: UTF8.self))
  NSApplication.shared.stop(nil)
  exit(0)
}

final class WheelWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

final class AccessibleChoice: NSAccessibilityElement {
  var press: (() -> Void)?
  override func accessibilityPerformPress() -> Bool {
    press?()
    return true
  }
}

final class WheelView: NSView {
  let bots: [WheelBot]
  let images: [NSImage?]
  var page = 0
  var hover: Int?
  var digits = ""
  var numberTimer: Timer?
  var tracking: NSTrackingArea?

  override var acceptsFirstResponder: Bool { true }
  private var center: NSPoint { NSPoint(x: bounds.midX, y: bounds.midY + 20) }
  private var outerRadius: CGFloat { min(bounds.width, bounds.height) * 0.38 }
  private var innerRadius: CGFloat { outerRadius * 0.36 }
  private var pageCount: Int { (bots.count + pageSize - 1) / pageSize }
  private var visibleIndices: Range<Int> {
    page * pageSize..<min((page + 1) * pageSize, bots.count)
  }
  private var previousRect: NSRect { NSRect(x: bounds.midX - 128, y: 29, width: 36, height: 32) }
  private var nextRect: NSRect { NSRect(x: bounds.midX + 92, y: 29, width: 36, height: 32) }
  private var closeRect: NSRect {
    NSRect(x: bounds.width - 48, y: bounds.height - 48, width: 32, height: 32)
  }

  init(bots: [WheelBot], frame: NSRect) {
    self.bots = bots
    images = bots.map { bot in
      guard let image = NSImage(contentsOfFile: bot.iconPath), let hex = bot.color else {
        return NSImage(contentsOfFile: bot.iconPath)
      }
      guard
        let number = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16)
      else { return image }
      let color = NSColor(
        srgbRed: CGFloat((number >> 16) & 255) / 255,
        green: CGFloat((number >> 8) & 255) / 255,
        blue: CGFloat(number & 255) / 255, alpha: 1)
      return NSImage(size: NSSize(width: 96, height: 96), flipped: false) { rect in
        color.setFill()
        rect.fill()
        image.draw(in: rect, from: .zero, operation: .destinationIn, fraction: 1)
        return true
      }
    }
    super.init(frame: frame)
    setBoundsSize(NSSize(width: 720, height: 720))
    setAccessibilityElement(false)
    setAccessibilityLabel("Grok bot wheel")
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let tracking { removeTrackingArea(tracking) }
    let area = NSTrackingArea(
      rect: bounds,
      options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
      owner: self)
    addTrackingArea(area)
    tracking = area
  }

  private func point(radius: CGFloat, angle: CGFloat) -> NSPoint {
    NSPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
  }

  private func sectorAngle(_ index: Int) -> CGFloat {
    .pi / 2 - CGFloat(index % pageSize) * .pi / 3
  }

  private func sector(_ index: Int) -> NSBezierPath {
    let angle = sectorAngle(index)
    let half: CGFloat = .pi / 6 - 0.013
    let path = NSBezierPath()
    path.move(to: point(radius: innerRadius, angle: angle + half))
    path.line(to: point(radius: outerRadius, angle: angle + half))
    path.appendArc(
      withCenter: center, radius: outerRadius,
      startAngle: (angle + half) * 180 / .pi, endAngle: (angle - half) * 180 / .pi, clockwise: true)
    path.line(to: point(radius: innerRadius, angle: angle - half))
    path.appendArc(
      withCenter: center, radius: innerRadius,
      startAngle: (angle - half) * 180 / .pi, endAngle: (angle + half) * 180 / .pi, clockwise: false
    )
    path.close()
    return path
  }

  private func text(
    _ value: String, in rect: NSRect, size: CGFloat, color: NSColor = .white,
    weight: NSFont.Weight = .regular
  ) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byTruncatingTail
    (value as NSString).draw(
      in: rect,
      withAttributes: [
        .font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color,
        .paragraphStyle: paragraph,
      ])
  }

  override func draw(_ dirtyRect: NSRect) {
    NSColor(srgbRed: 0.07, green: 0.09, blue: 0.10, alpha: 0.98).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: 24, yRadius: 24).fill()
    text(
      "Message a bot",
      in: NSRect(x: 50, y: bounds.height - 57, width: bounds.width - 100, height: 28), size: 20,
      weight: .semibold)
    text("×", in: closeRect, size: 25, color: muted)

    for index in visibleIndices {
      let selected = hover == index
      let path = sector(index)
      (selected ? gold.withAlphaComponent(0.25) : NSColor.white.withAlphaComponent(0.065)).setFill()
      path.fill()
      (selected ? gold : NSColor.white.withAlphaComponent(0.12)).setStroke()
      path.lineWidth = selected ? 1.5 : 0.7
      path.stroke()
      let position = point(radius: (innerRadius + outerRadius) * 0.54, angle: sectorAngle(index))
      images[index]?.draw(in: NSRect(x: position.x - 25, y: position.y - 4, width: 50, height: 50))
      text(
        String(index + 1),
        in: NSRect(x: position.x - 28, y: position.y + 46, width: 56, height: 20), size: 13,
        color: selected ? gold : muted, weight: .bold)
      text(
        bots[index].name,
        in: NSRect(x: position.x - 70, y: position.y - 39, width: 140, height: 36), size: 14,
        weight: .medium)
      if bots[index].isPinned,
        let pin = NSImage(systemSymbolName: "pin.fill", accessibilityDescription: nil)?
          .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [gold]))
      {
        pin.draw(in: NSRect(x: position.x + 18, y: position.y + 51, width: 10, height: 10))
      }
    }

    if !digits.isEmpty {
      text(
        digits, in: NSRect(x: center.x - 76, y: center.y - 12, width: 152, height: 48), size: 36,
        color: gold, weight: .semibold)
    } else if let hover {
      text(
        bots[hover].name,
        in: NSRect(
          x: center.x - innerRadius + 10, y: center.y - 22, width: innerRadius * 2 - 20, height: 60),
        size: 17, weight: .semibold)
    } else {
      text(
        "Choose a bot", in: NSRect(x: center.x - 85, y: center.y - 10, width: 170, height: 30),
        size: 17, color: muted)
    }

    text(
      "Type 1–\(bots.count) · Enter selects · Esc closes",
      in: NSRect(x: 30, y: 76, width: bounds.width - 60, height: 23), size: 12, color: muted)
    text(
      "\(visibleIndices.lowerBound + 1)–\(visibleIndices.upperBound) of \(bots.count)",
      in: NSRect(x: bounds.midX - 90, y: 34, width: 180, height: 22), size: 13, color: muted)
    if pageCount > 1 {
      text("‹", in: previousRect, size: 27, color: gold)
      text("›", in: nextRect, size: 27, color: gold)
    }
  }

  private func hoveredIndex(at location: NSPoint) -> Int? {
    let dx = location.x - center.x
    let dy = location.y - center.y
    let radius = hypot(dx, dy)
    guard radius >= innerRadius, radius <= outerRadius else { return nil }
    let clockwise = (.pi / 2 - atan2(dy, dx) + .pi / 6 + .pi * 2).truncatingRemainder(
      dividingBy: .pi * 2)
    let index = page * pageSize + Int(clockwise / (.pi / 3))
    return index < bots.count ? index : nil
  }

  override func mouseMoved(with event: NSEvent) {
    hover = hoveredIndex(at: convert(event.locationInWindow, from: nil))
    needsDisplay = true
  }

  override func mouseExited(with event: NSEvent) {
    hover = nil
    needsDisplay = true
  }

  private func changePage(_ delta: Int) {
    numberTimer?.invalidate()
    digits = ""
    page = (page + delta + pageCount) % pageCount
    hover = nil
    needsDisplay = true
    NSAccessibility.post(element: self, notification: .layoutChanged)
  }

  override func mouseUp(with event: NSEvent) {
    let location = convert(event.locationInWindow, from: nil)
    if closeRect.contains(location) { finish() }
    if pageCount > 1 && previousRect.contains(location) {
      changePage(-1)
      return
    }
    if pageCount > 1 && nextRect.contains(location) {
      changePage(1)
      return
    }
    if let index = hoveredIndex(at: location) { finish(bots[index].id) }
  }

  override func keyDown(with event: NSEvent) {
    numberTimer?.invalidate()
    switch event.keyCode {
    case 53: finish()
    case 123, 126: changePage(-1)
    case 124, 125: changePage(1)
    case 36, 76:
      if let number = Int(digits), number > 0, number <= bots.count { finish(bots[number - 1].id) }
      if let hover { finish(bots[hover].id) }
    case 51:
      if !digits.isEmpty { digits.removeLast() }
    default:
      guard let characters = event.characters, characters.allSatisfy({ $0.isASCII && $0.isNumber })
      else { return }
      let proposed = digits + characters
      guard let number = Int(proposed), number > 0, number <= bots.count else {
        NSSound.beep()
        return
      }
      digits = proposed
      page = (number - 1) / pageSize
      hover = number - 1
      if number <= bots.count / 10 {
        numberTimer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) {
          [weak self] _ in
          guard let self, let current = Int(self.digits), current == number else { return }
          finish(self.bots[number - 1].id)
        }
      } else {
        finish(bots[number - 1].id)
      }
    }
    needsDisplay = true
  }

  private func accessibleButton(_ label: String, rect: NSRect, action: @escaping () -> Void)
    -> AccessibleChoice
  {
    let choice = AccessibleChoice()
    choice.setAccessibilityRole(.button)
    choice.setAccessibilityParent(self)
    choice.setAccessibilityLabel(label)
    choice.setAccessibilityFrame(NSAccessibility.screenRect(fromView: self, rect: rect))
    choice.press = action
    return choice
  }

  override func accessibilityChildren() -> [Any]? {
    var choices = visibleIndices.map { index in
      let position = point(radius: (innerRadius + outerRadius) * 0.54, angle: sectorAngle(index))
      return accessibleButton(
        "\(index + 1). \(bots[index].name)\(bots[index].isPinned ? ", pinned" : "")",
        rect: NSRect(x: position.x - 70, y: position.y - 39, width: 140, height: 110)
      ) { finish(self.bots[index].id) }
    }
    choices.append(accessibleButton("Close wheel", rect: closeRect) { finish() })
    if pageCount > 1 {
      choices.append(accessibleButton("Previous bots", rect: previousRect) { self.changePage(-1) })
      choices.append(accessibleButton("Next bots", rect: nextRect) { self.changePage(1) })
    }
    return choices
  }

  func checkSelectionGeometry() {
    let originalPage = page
    for candidatePage in 0..<pageCount {
      page = candidatePage
      for index in visibleIndices {
        let location = point(radius: (innerRadius + outerRadius) * 0.54, angle: sectorAngle(index))
        precondition(
          hoveredIndex(at: location) == index, "Wheel sector selection must match its numbered bot")
      }
      precondition(hoveredIndex(at: center) == nil)
      precondition(hoveredIndex(at: point(radius: outerRadius + 10, angle: 0)) == nil)
      precondition(accessibilityChildren()?.count == visibleIndices.count + (pageCount > 1 ? 3 : 1))
    }
    page = originalPage
  }
}

final class WheelDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
  func applicationDidResignActive(_ notification: Notification) { finish() }
  func windowWillClose(_ notification: Notification) { finish() }
}

do {
  let request = try JSONDecoder().decode(
    WheelRequest.self, from: FileHandle.standardInput.readDataToEndOfFile())
  guard !request.bots.isEmpty else {
    throw NSError(
      domain: "GrokBotWheel", code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Open Grok Bot and load your bots first."])
  }
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let delegate = WheelDelegate()
  app.delegate = delegate
  let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 800)
  let side = min(720, visible.width - 30, visible.height - 30)
  let rect = NSRect(
    x: visible.midX - side / 2, y: visible.midY - side / 2, width: side, height: side)
  let window = WheelWindow(
    contentRect: rect, styleMask: .borderless, backing: .buffered, defer: false)
  window.title = "Grok Bot Wheel"
  window.isOpaque = false
  window.backgroundColor = .clear
  window.hasShadow = true
  window.level = .floating
  window.delegate = delegate
  let view = WheelView(bots: request.bots, frame: NSRect(origin: .zero, size: rect.size))
  window.contentView = view
  if CommandLine.arguments.contains("--self-test") {
    view.checkSelectionGeometry()
    finish()
  }
  if let preview = request.previewPath {
    if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
      view.cacheDisplay(in: view.bounds, to: bitmap)
      try bitmap.representation(using: .png, properties: [:])?.write(
        to: URL(fileURLWithPath: preview))
    }
    finish()
  }
  window.makeKeyAndOrderFront(nil)
  window.makeFirstResponder(view)
  app.activate(ignoringOtherApps: true)
  app.run()
} catch {
  let data = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
  print(String(decoding: data, as: UTF8.self))
  exit(1)
}
