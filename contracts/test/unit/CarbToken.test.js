const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CarbToken (CARB)", function () {
  const SUPPLY = 1_000_000_000n * 10n ** 18n;
  let treasury, alice, bob, carb;

  beforeEach(async function () {
    [treasury, alice, bob] = await ethers.getSigners();
    carb = await (await ethers.getContractFactory("CarbToken")).deploy(treasury.address);
    await carb.waitForDeployment();
  });

  it("mints the fixed supply once to the recipient; metadata is CARB / 18", async function () {
    expect(await carb.name()).to.equal("Carbonized Carbon");
    expect(await carb.symbol()).to.equal("CARB");
    expect(await carb.decimals()).to.equal(18n);
    expect(await carb.INITIAL_SUPPLY()).to.equal(SUPPLY);
    expect(await carb.totalSupply()).to.equal(SUPPLY);
    expect(await carb.balanceOf(treasury.address)).to.equal(SUPPLY);
  });

  it("rejects a zero recipient", async function () {
    await expect((await ethers.getContractFactory("CarbToken")).deploy(ethers.ZeroAddress)).to.be.revertedWith(
      "Invalid recipient"
    );
  });

  it("has no mint / owner / pause / blacklist / admin surface", async function () {
    const banned = ["mint", "owner", "pause", "unpause", "blacklist", "grantRole", "transferOwnership", "setFee"];
    for (const name of banned) {
      expect(carb.interface.hasFunction(name), name).to.equal(false);
    }
  });

  it("holders can burn their own tokens and burnFrom needs allowance; supply only ever decreases", async function () {
    await carb.transfer(alice.address, 1000n);
    await carb.connect(alice).burn(400n);
    expect(await carb.totalSupply()).to.equal(SUPPLY - 400n);
    expect(await carb.balanceOf(alice.address)).to.equal(600n);

    await expect(carb.connect(bob).burnFrom(alice.address, 1n)).to.be.reverted;
    await carb.connect(alice).approve(bob.address, 100n);
    await carb.connect(bob).burnFrom(alice.address, 100n);
    expect(await carb.totalSupply()).to.equal(SUPPLY - 500n);
  });

  it("supports ERC-2612 permit", async function () {
    const value = 12345n;
    const deadline = (await time.latest()) + 3600;
    const nonce = await carb.nonces(alice.address);
    const domain = {
      name: "Carbonized Carbon",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await carb.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const sig = ethers.Signature.from(
      await alice.signTypedData(domain, types, { owner: alice.address, spender: bob.address, value, nonce, deadline })
    );
    await carb.permit(alice.address, bob.address, value, deadline, sig.v, sig.r, sig.s);
    expect(await carb.allowance(alice.address, bob.address)).to.equal(value);
    await expect(carb.permit(alice.address, bob.address, value, deadline, sig.v, sig.r, sig.s)).to.be.reverted;
  });

  it("uses a TIMESTAMP clock (ERC-6372) and checkpoints votes by timestamp", async function () {
    expect(await carb.CLOCK_MODE()).to.equal("mode=timestamp");
    const now = await time.latest();
    expect(Number(await carb.clock())).to.be.closeTo(now, 2);

    await carb.transfer(alice.address, 5000n);
    expect(await carb.getVotes(alice.address)).to.equal(0n); // not delegated yet
    await carb.connect(alice).delegate(alice.address);
    expect(await carb.getVotes(alice.address)).to.equal(5000n);

    const t1 = await time.latest();
    await time.increase(100);
    await carb.connect(alice).transfer(bob.address, 2000n);
    expect(await carb.getVotes(alice.address)).to.equal(3000n);
    expect(await carb.getPastVotes(alice.address, t1)).to.equal(5000n);
  });

  it("burning reduces delegated votes and total supply checkpoints", async function () {
    await carb.transfer(alice.address, 1000n);
    await carb.connect(alice).delegate(alice.address);
    await carb.connect(alice).burn(300n);
    expect(await carb.getVotes(alice.address)).to.equal(700n);
    const t = await time.latest();
    await time.increase(10);
    expect(await carb.getPastTotalSupply(t)).to.equal(SUPPLY - 300n);
  });
});
