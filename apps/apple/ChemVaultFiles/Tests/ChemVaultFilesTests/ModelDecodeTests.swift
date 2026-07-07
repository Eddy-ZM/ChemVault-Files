import XCTest
@testable import ChemVaultFiles

final class ModelDecodeTests: XCTestCase {
    func testFileDecode() throws {
        let json = """
        {
          "id": "file_1",
          "projectId": "project_1",
          "folderId": null,
          "displayName": "report.pdf",
          "originalName": "report.pdf",
          "mimeType": "application/pdf",
          "sizeBytes": 1234,
          "status": "ready",
          "checksum": null,
          "actorEmail": "owner@chemvault.science",
          "downloadCount": 0,
          "visibility": "private",
          "roleIds": [],
          "ownerUserId": "owner@chemvault.science",
          "parentId": null,
          "isStarred": true,
          "trashedAt": null,
          "lastOpenedAt": null,
          "sharedStatus": "private",
          "createdAt": "2026-07-05T00:00:00.000Z",
          "updatedAt": "2026-07-05T00:00:00.000Z",
          "deletedAt": null,
          "tags": []
        }
        """
        let file = try JSONDecoder().decode(CVFileItem.self, from: Data(json.utf8))
        XCTAssertEqual(file.typeLabel, "PDF")
        XCTAssertEqual(file.fileExtension, "PDF")
        XCTAssertEqual(file.isStarred, true)
    }
}
