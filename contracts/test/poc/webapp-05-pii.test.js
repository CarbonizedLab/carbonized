const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * [AUD-WEBAPP-06] REGRESSION: company / trader contact data (email, phone) is no longer written to the public chain.
 * The registry only stores a salted commitment keccak256(abi.encode(email, phone, salt)) computed in the browser /
 * backend; a stranger reading getCompanyData / getTraderData or the logs sees only the 32-byte hash.
 */
describe("[AUD-WEBAPP-06] PII entered in the registration form is no longer world-readable onchain", function () {
  it("[AUD-WEBAPP-06] a stranger cannot read email/phone of a company or trader (only an opaque commitment)", async function () {
    const [admin, company, trader, stranger] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("CarbonRegistry")).deploy(admin.address);

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const email = "cfo@acme.example";
    const phone = "+86 138 0000 0000";
    const commitment = ethers.keccak256(coder.encode(["string", "string", "bytes32"], [email, phone, salt]));

    await registry.connect(company).registerCompany("ACME Ltd", "91110000MA01XXXXXX", 1000n, 0n, 0n, commitment);
    const traderCommitment = ethers.keccak256(
      coder.encode(["string", "string", "bytes32"], ["alice@example.com", "+1 555 010 9999", salt])
    );
    await registry.connect(trader).registerTrader("Alice Zhang", traderCommitment, "CN");

    const c = await registry.connect(stranger).getCompanyData(company.address);
    const t = await registry.connect(stranger).getTraderData(trader.address);
    expect(c.email).to.equal(undefined);
    expect(c.phone).to.equal(undefined);
    expect(t.email).to.equal(undefined);
    expect(t.phone).to.equal(undefined);
    expect(c.contactHash).to.equal(commitment);
    expect(t.contactHash).to.equal(traderCommitment);

    // nothing readable in any log either
    const logs = await ethers.provider.getLogs({ address: await registry.getAddress(), fromBlock: 0 });
    const blob = logs.map((l) => l.data).join("");
    for (const secret of [email, phone, "alice@example.com", "+1 555 010 9999"]) {
      expect(blob).to.not.include(ethers.hexlify(ethers.toUtf8Bytes(secret)).slice(2));
    }

    // the commitment is verifiable only by someone who knows the preimage (salt)
    expect(ethers.keccak256(coder.encode(["string", "string", "bytes32"], [email, phone, ethers.ZeroHash]))).to.not.equal(
      commitment
    );
  });
});
