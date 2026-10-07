const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const SUPPLY = ethers.parseUnits("1000000000", 18);

describe("GSMCredit", () => {
  let admin, treasury, alice, bob, token;

  beforeEach(async () => {
    [admin, treasury, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("GSMCredit");
    token = await upgrades.deployProxy(F, [admin.address, treasury.address, SUPPLY], { kind: "uups" });
    await token.waitForDeployment();
  });

  it("has the right name, symbol, decimals and supply", async () => {
    expect(await token.name()).to.equal("GYSM Credit");
    expect(await token.symbol()).to.equal("GSM");
    expect(await token.decimals()).to.equal(18n);
    expect(await token.totalSupply()).to.equal(SUPPLY);
    expect(await token.balanceOf(treasury.address)).to.equal(SUPPLY);
  });

  it("cannot be initialized twice", async () => {
    await expect(token.initialize(admin.address, treasury.address, SUPPLY)).to.be.reverted;
  });

  it("rejects zero addresses and zero supply", async () => {
    const F = await ethers.getContractFactory("GSMCredit");
    await expect(upgrades.deployProxy(F, [ethers.ZeroAddress, treasury.address, SUPPLY], { kind: "uups" })).to.be.reverted;
    await expect(upgrades.deployProxy(F, [admin.address, ethers.ZeroAddress, SUPPLY], { kind: "uups" })).to.be.reverted;
    await expect(upgrades.deployProxy(F, [admin.address, treasury.address, 0], { kind: "uups" })).to.be.reverted;
  });

  it("exposes no mint, pause or blacklist function", () => {
    const names = token.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const banned of ["mint", "pause", "unpause", "blacklist", "setFee"]) {
      expect(names).to.not.include(banned);
    }
  });

  it("transfers and burns", async () => {
    await token.connect(treasury).transfer(alice.address, 100n);
    await token.connect(alice).transfer(bob.address, 40n);
    expect(await token.balanceOf(bob.address)).to.equal(40n);
    await token.connect(bob).burn(10n);
    expect(await token.totalSupply()).to.equal(SUPPLY - 10n);
  });

  it("only UPGRADER_ROLE can upgrade, and balances survive", async () => {
    await token.connect(treasury).transfer(alice.address, 500n);
    const V2 = await ethers.getContractFactory("GSMCreditV2Mock");

    await expect(upgrades.upgradeProxy(token, V2.connect(alice))).to.be.reverted;

    const upgraded = await upgrades.upgradeProxy(token, V2.connect(admin));
    expect(await upgraded.version()).to.equal("2");
    expect(await upgraded.balanceOf(alice.address)).to.equal(500n);
    expect(await upgraded.totalSupply()).to.equal(SUPPLY);
  });

  it("admin can hand the upgrade key to a multisig and drop their own", async () => {
    const UP = await token.UPGRADER_ROLE();
    await token.grantRole(UP, bob.address);
    await token.renounceRole(UP, admin.address);
    const V2 = await ethers.getContractFactory("GSMCreditV2Mock");
    await expect(upgrades.upgradeProxy(token, V2.connect(admin))).to.be.reverted;
    const upgraded = await upgrades.upgradeProxy(token, V2.connect(bob));
    expect(await upgraded.version()).to.equal("2");
  });
});
