import Foundation
import PDFKit
import AppKit
let a = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: a[1])),
      let page = doc.page(at: Int(a[2])! - 1) else { exit(1) }
let scale = Double(a[3])!
// crop fractions: x0 y0 x1 y1 measured from TOP-LEFT
let fx0 = Double(a[4])!, fy0 = Double(a[5])!, fx1 = Double(a[6])!, fy1 = Double(a[7])!
let b = page.bounds(for: .mediaBox)
let crop = NSRect(x: b.minX + fx0*b.width,
                  y: b.minY + (1.0-fy1)*b.height,
                  width: (fx1-fx0)*b.width,
                  height: (fy1-fy0)*b.height)
let px = NSSize(width: crop.width*scale, height: crop.height*scale)
let img = NSImage(size: px)
img.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
ctx.setFillColor(CGColor.white); ctx.fill(CGRect(origin: .zero, size: px))
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: -crop.minX, y: -crop.minY)
page.draw(with: .mediaBox, to: ctx)
img.unlockFocus()
let tiff = img.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[8]))
print("wrote \(a[8]) \(Int(px.width))x\(Int(px.height))")
